import { useState, useEffect, useRef } from 'react'
import { processAPI } from '../api'

const STATUS_COLORS = {
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  done:    'text-green-400',
  error:   'text-red-400',
}
const STATUS_ICONS = { pending: '⏳', running: '⚙️', done: '✅', error: '❌' }

export default function ProcessingPanel({ open, onToggle, onComplete }) {
  const [jobs, setJobs]       = useState([])
  const [stats, setStats]     = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const loadJobs = async () => {
    try {
      const [j, s] = await Promise.all([processAPI.jobs(), processAPI.stats()])
      setJobs(j.data)
      setStats(s.data)
    } catch {}
  }

  useEffect(() => {
    loadJobs()
    pollRef.current = setInterval(loadJobs, 3000)
    return () => clearInterval(pollRef.current)
  }, [])

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      try {
        await processAPI.upload(file, (ev) => {
          setUploadPct(Math.round(ev.loaded / ev.total * 100))
        })
      } catch {}
    }
    setUploading(false)
    setUploadPct(0)
    fileRef.current.value = ''
    loadJobs()
  }

  const deleteJob = async (id) => {
    await processAPI.delete(id)
    loadJobs()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <span className="text-xl">⚙️</span>
          <div>
            <h2 className="text-white font-bold">Procesamiento de datos OCDS</h2>
            <p className="text-xs text-gray-400">Carga y procesa los ZIP históricos de comprasestatales.gub.uy</p>
          </div>
          <button onClick={onToggle} className="ml-auto text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        {/* DB Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-gray-800">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="bg-gray-800 rounded-lg px-3 py-2 text-center">
                <div className="text-white font-bold text-sm">{v?.toLocaleString()}</div>
                <div className="text-gray-500 text-xs capitalize">{k}</div>
              </div>
            ))}
          </div>
        )}

        {/* Upload */}
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="flex gap-3">
            <label className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-xl cursor-pointer transition-colors font-medium text-sm">
              <span>📁</span> Cargar ZIP(s)
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
          {uploading && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Subiendo...</span><span>{uploadPct}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Jobs list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">Jobs</h3>
          {jobs.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              Sin jobs. Carga un ZIP para comenzar.
            </div>
          )}
          {jobs.map(job => (
            <div key={job.id} className="bg-gray-800 rounded-xl px-4 py-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <span className="text-lg">{STATUS_ICONS[job.status]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{job.filename}</p>
                  <p className={`text-xs ${STATUS_COLORS[job.status]}`}>
                    {job.status.toUpperCase()} · Año {job.year}
                  </p>
                </div>
                <button
                  onClick={() => deleteJob(job.id)}
                  className="text-gray-600 hover:text-red-400 text-sm transition-colors"
                >
                  🗑
                </button>
              </div>
              {job.status === 'running' && job.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span className="truncate">{job.message}</span>
                    <span>{job.progress}/{job.total}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${(job.progress/job.total*100).toFixed(0)}%` }}
                    />
                  </div>
                </div>
              )}
              {job.message && job.status !== 'running' && (
                <p className="text-xs text-gray-500 truncate">{job.message}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
