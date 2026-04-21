import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '12px',
          fontSize: '13px',
          fontFamily: 'Inter, sans-serif',
          fontWeight: '500',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        },
        success: {
          iconTheme: { primary: '#22c55e', secondary: 'hsl(var(--card))' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: 'hsl(var(--card))' },
        },
      }}
    />
  </React.StrictMode>
)
