import { useState, useEffect, useRef } from 'react'
import { 
  Package, RefreshCcw, Activity, ShieldCheck, 
  AlertCircle, CheckCircle2, Clock, Upload, Database,
  Users, FileText, TrendingUp, ShoppingCart
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_BASE = '/api/process'
export default function AdminDashboard() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/jobs`)
      setJobs(data)
    } catch (err) {
      console.error('Failed to fetch admin data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-8 space-y-8 animate-fade-up">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Consola de Administración</h2>
          <p className="text-sm text-muted-foreground mt-1">Gestión de datos OCDS y monitoreo del sistema</p>
        </div>
        <button 
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-bold"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Jobs List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg">Cola de Procesamiento</h3>
            {jobs.some(j => j.status === 'running') && (
              <span className="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary animate-pulse">
                EN PROGRESO
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            {jobs.length === 0 && !loading && (
              <div className="p-12 text-center rounded-2xl border-2 border-dashed border-border text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-sm">No hay trabajos registrados</p>
                <p className="text-xs mt-1 opacity-60">Sube un archivo ZIP para comenzar la ingesta</p>
              </div>
            )}
            {jobs.map(job => {
              const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0
              return (
                <div key={job.id} className="p-5 rounded-2xl bg-card border border-border group hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${
                        job.status === 'done' ? 'bg-green-500/10 text-green-500' : 
                        job.status === 'error' ? 'bg-red-500/10 text-red-500' : 
                        'bg-primary/10 text-primary'
                      }`}>
                        {job.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> : 
                         job.status === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                         <Clock className="w-5 h-5 animate-spin" />}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{job.filename}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          Año: {job.year} • {job.message || 'Pendiente'}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                      job.status === 'done' ? 'bg-green-500/10 text-green-500' : 
                      job.status === 'error' ? 'bg-red-500/10 text-red-500' : 
                      'bg-primary/10 text-primary'
                    }`}>
                      {job.status}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {job.status === 'running' && (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground font-mono mb-1">
                        <span>{job.progress.toLocaleString()} / {job.total.toLocaleString()} archivos</span>
                        <span className="font-bold text-primary">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all duration-700 animate-glow-pulse" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {job.status === 'done' && job.total > 0 && (
                    <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full w-full" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Upload */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg">Nueva Ingesta</h3>
          </div>
          <FileDropzone onUploadComplete={fetchData} />
        </div>
      </div>
    </div>
  )
}

function FileDropzone({ onUploadComplete }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef(null)

  const handleUpload = async (file) => {
    if (!file) return
    if (!file.name.endsWith('.zip')) {
      setError('Solo se aceptan archivos .zip'); return
    }
    setUploading(true); setError(null); setSuccess(false); setUploadPct(0)

    const formData = new FormData()
    formData.append('file', file)
    try {
      await axios.post('/api/process/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setUploadPct(Math.round((e.loaded / e.total) * 100))
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      toast.success(`¡${file.name} subido! Procesando en segundo plano...`)
      onUploadComplete()
    } catch (err) {
      const msg = 'Error: ' + (err.response?.data?.detail || err.message)
      setError(msg)
      toast.error(msg)
    } finally {
      setUploading(false); setUploadPct(0)
    }
  }

  return (
    <div 
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files[0]) }}
      onClick={() => !uploading && fileInputRef.current?.click()}
      className={`relative p-8 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center group cursor-pointer aspect-square overflow-hidden ${
        success   ? 'border-green-500 bg-green-500/5' :
        dragging  ? 'border-primary bg-primary/10 scale-[1.02]' : 
        uploading ? 'border-primary/50 bg-primary/5 cursor-wait' :
                    'border-border hover:border-primary/50 hover:bg-accent/30'
      }`}
    >
      <input 
        type="file" ref={fileInputRef} 
        onChange={(e) => handleUpload(e.target.files[0])}
        className="hidden" accept=".zip"
      />

      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all ${
        success  ? 'bg-green-500/20' :
        dragging ? 'bg-primary/20 scale-110' : 
        'bg-primary/10 group-hover:scale-110'
      }`}>
        <span className="text-3xl">
          {success ? '✅' : uploading ? '⬆️' : dragging ? '📥' : '📦'}
        </span>
      </div>

      <h4 className="font-bold text-sm mb-1">
        {success ? '¡Subido con éxito!' : uploading ? `Subiendo... ${uploadPct}%` : 'Subir archivo OCDS'}
      </h4>
      <p className="text-xs text-muted-foreground max-w-[180px] leading-relaxed">
        {dragging ? 'Suelta para comenzar' : 'Arrastra un ZIP o haz clic para seleccionar'}
      </p>

      {/* Upload progress bar */}
      {uploading && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${uploadPct}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mt-3 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[10px] font-bold">
          {error}
        </div>
      )}
    </div>
  )
}
