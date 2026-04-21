import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const graphAPI = {
  root:     ()              => api.get('/graph/root'),
  organismo:(id, params)   => api.get(`/graph/organismo/${encodeURIComponent(id)}`, { params }),
  llamado:  (ocid)          => api.get(`/graph/llamado/${encodeURIComponent(ocid)}`),
  item:     (id)            => api.get(`/graph/item/${encodeURIComponent(id)}`),
  supplier: (id)            => api.get(`/graph/supplier/${encodeURIComponent(id)}`),
}

export const nodeAPI = {
  organismo: (id)  => api.get(`/nodes/organismo/${encodeURIComponent(id)}`),
  llamado:   (id)  => api.get(`/nodes/llamado/${encodeURIComponent(id)}`),
  item:      (id)  => api.get(`/nodes/item/${encodeURIComponent(id)}`),
  supplier:  (id)  => api.get(`/nodes/supplier/${encodeURIComponent(id)}`),
}

export const searchAPI = {
  search:   (q)       => api.get('/search', { params: { q } }),
  llamados: (params)  => api.get('/llamados', { params }),
  filters:  ()        => api.get('/filters'),
  priceHistory: (id, year) => api.get(`/items/${encodeURIComponent(id)}/price-history`, { params: { year } }),
}

export const processAPI = {
  upload:  (file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/process/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    })
  },
  jobs:    ()   => api.get('/process/jobs'),
  job:     (id) => api.get(`/process/jobs/${id}`),
  delete:  (id) => api.delete(`/process/jobs/${id}`),
  stats:   ()   => api.get('/process/stats'),
}
