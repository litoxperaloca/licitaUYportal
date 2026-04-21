import os
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
from auth import get_current_user
from openai import AsyncAzureOpenAI
from database import get_conn

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Inicializar cliente de Azure OpenAI con las variables inyectadas en docker-compose
client = AsyncAzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", "https://mock.openai.azure.com/"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
)
DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4")

class AIQueryRequest(BaseModel):
    query: str

class AIAnalysisResponse(BaseModel):
    analysis: str
    kpis: List[dict]
    chart_suggestions: List[dict]
    sql_query: Optional[str] = None
    data: Optional[List[dict]] = None
    error: Optional[str] = None

SCHEMA_INFO = """
Table: organismos (id, name)
Table: suppliers (id, name)
Table: llamados (ocid, title, method, buyer_id, date, year, description, status)
Table: items (id, cat_id, description, scheme, unit)
Table: adjudicaciones (id, item_id, supplier_id, org_id, ocid, amount, currency, quantity, unit, date, year)

NOTES: 
- Total price of an adjudication = amount * COALESCE(quantity, 1)
- 'amount' is usually unit price.
- 'amount' and 'currency' can be null or 0.
- fts_items(item_id, description) can be joined for fast text search on item desc if needed (fts_items MATCH 'text'). 
"""

@router.post("/query", response_model=AIAnalysisResponse)
async def analyze_natural_language(request: AIQueryRequest):
    if not os.getenv("AZURE_OPENAI_API_KEY"):
        return AIAnalysisResponse(
            analysis="El servicio Azure OpenAI no está configurado (falta AZURE_OPENAI_API_KEY).",
            kpis=[], chart_suggestions=[]
        )

    # 1) Solicitar al LLM que genere la query SQL
    sql_prompt = [
        {"role": "system", "content": f"Eres un experto analista SQL para datos de compras públicas de Uruguay (LicitaUY).\nEsquema:\n{SCHEMA_INFO}\nInstrucciones:\n1. Genera UNA única consulta SQLite cruda para responder la pregunta del usuario.\n2. NO incluyas formato markdown (```sql), devuelve sOlo texto puro.\n3. Asegúrate de incluir un LIMIT (máximo 50) siempre.\n4. Si piden el mayor gasto, calcula SUM(amount * quantity) y agrúpalo."},
        {"role": "user", "content": request.query}
    ]
    
    try:
        sql_res = await client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=sql_prompt
        )
        sql_query = sql_res.choices[0].message.content.strip().replace('```sql', '').replace('```', '').strip()
    except Exception as e:
        raise HTTPException(500, f"Error generando SQL vía OpenAI: {str(e)}")

    # 2) Validar y Ejecutar SQL
    if not sql_query.lower().startswith("select"):
        return AIAnalysisResponse(
            analysis="La IA no pudo generar una consulta segura para esta pregunta.",
            kpis=[], chart_suggestions=[], error="INVALID_SQL", sql_query=sql_query
        )

    conn = get_conn()
    try:
        rows = conn.execute(sql_query).fetchall()
        data = [dict(r) for r in rows]
    except Exception as e:
        conn.close()
        return AIAnalysisResponse(
            analysis="Hubo un error ejecutando la consulta en la base de datos.",
            kpis=[], chart_suggestions=[], error=str(e), sql_query=sql_query
        )
    finally:
        conn.close()

    # 3) Solicitar al LLM análisis y KPIs en formato JSON
    data_str = json.dumps(data[:50], ensure_ascii=False) # Limitar datos enviados
    
    analysis_prompt = [
        {"role": "system", "content": "Eres un asistente de datos senior. Analiza los resultados JSON de la base de datos de compras públicas y genera una respuesta ESTRUCTURADA en JSON.\n\nFormato esperado EXACTO en JSON:\n{\n  \"analysis\": \"Texto explicativo detallado y elegante de lo que indican los datos.\",\n  \"kpis\": [{\"label\": \"Gasto Total Estimado\", \"value\": \"$ 10.5M\"}],\n  \"chart_suggestions\": [{\"type\": \"bar|pie\", \"title\": \"Título gráfico\", \"data\": [{\"name\": \"...\", \"value\": 10}]}]\n}\n\nREGLAS:\n- chart_suggestions solo si aplica. 'name' debe ser String, 'value' Numérico.\n- Devuelve SOLO el objeto JSON puro sin bloques markdown."},
        {"role": "user", "content": f"Pregunta original: {request.query}\n\nDatos obtenidos:\n{data_str}"}
    ]

    try:
        analysis_res = await client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=analysis_prompt
        )
        
        # O-series models return raw text even without JSON mode, so we parse it.
        # But we must clean markdown json blocks if present.
        content = analysis_res.choices[0].message.content.strip()
        if content.startswith('```json'):
            content = content[7:-3].strip()
        elif content.startswith('```'):
            content = content[3:-3].strip()
            
        result_json = json.loads(content)
        
        return AIAnalysisResponse(
            analysis=result_json.get("analysis", "Análisis completo."),
            kpis=result_json.get("kpis", []),
            chart_suggestions=result_json.get("chart_suggestions", []),
            sql_query=sql_query,
            data=data
        )
    except Exception as e:
        return AIAnalysisResponse(
            analysis=f"Los datos fueron extraídos pero el análisis falló: {str(e)}",
            kpis=[], chart_suggestions=[], sql_query=sql_query, data=data
        )
