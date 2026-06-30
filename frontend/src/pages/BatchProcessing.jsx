import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'

const API_BASE = 'http://localhost:8000'

export default function BatchProcessing() {
  const [activeTab, setActiveTab] = useState('upload') // upload, daterange, results
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [jobFiles, setJobFiles] = useState([])
  const [pollingInterval, setPollingInterval] = useState(null)
  const [downloadingCsv, setDownloadingCsv] = useState(false)

  // Dropzone for file upload
  const onDrop = useCallback(acceptedFiles => {
    const ALLOWED = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp']
    const valid = acceptedFiles.filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ALLOWED.includes(ext)
    })

    if (valid.length !== acceptedFiles.length) {
      toast.error(`${acceptedFiles.length - valid.length} files have unsupported types`)
    }

    if (valid.length > 50) {
      toast.error('Maximum 50 files per batch')
      return
    }

    setUploadedFiles(prev => [...prev, ...valid].slice(0, 50))
    toast.success(`Added ${valid.length} file(s)`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
  })

  // Start batch upload
  const handleBatchUpload = async () => {
    if (uploadedFiles.length === 0) {
      toast.error('Select files first')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      uploadedFiles.forEach(file => {
        formData.append('files', file)
      })

      const response = await axios.post(`${API_BASE}/api/batch/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const newJobId = response.data.job_id
      setJobId(newJobId)
      setUploadedFiles([])
      setActiveTab('results')
      toast.success(`Batch job ${newJobId.slice(0, 8)} started!`)
      
      // Start polling
      startPolling(newJobId)
    } catch (error) {
      toast.error(`Upload failed: ${error.response?.data?.detail || error.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  // Date range processing
  const handleDateRange = async () => {
    if (!dateStart || !dateEnd) {
      toast.error('Select both start and end dates')
      return
    }

    if (new Date(dateStart) > new Date(dateEnd)) {
      toast.error('Start date must be before end date')
      return
    }

    try {
      const response = await axios.post(
        `${API_BASE}/api/batch/process-date-range`,
        null,
        { params: { date_start: dateStart, date_end: dateEnd } }
      )

      const newJobId = response.data.job_id
      setJobId(newJobId)
      setActiveTab('results')
      toast.success(`Processing ${response.data.files_queued} files...`)
      startPolling(newJobId)
    } catch (error) {
      toast.error(`Date range processing failed: ${error.response?.data?.detail || error.message}`)
    }
  }

  // Quick filters (today, week, month)
  const handleQuickFilter = async (filterType) => {
    try {
      let endpoint = ''
      if (filterType === 'today') endpoint = `${API_BASE}/api/batch/process-today`
      else if (filterType === 'week') endpoint = `${API_BASE}/api/batch/process-week`
      else if (filterType === 'month') endpoint = `${API_BASE}/api/batch/process-month`

      const response = await axios.post(endpoint)
      const newJobId = response.data.job_id
      setJobId(newJobId)
      setActiveTab('results')
      toast.success(`Processing ${response.data.files_queued} files from ${filterType}...`)
      startPolling(newJobId)
    } catch (error) {
      toast.error(`${filterType} filter failed: ${error.response?.data?.detail || error.message}`)
    }
  }

  // Poll job status
  const startPolling = (jid) => {
    // Clear existing interval
    if (pollingInterval) clearInterval(pollingInterval)

    // Fetch immediately
    fetchJobStatus(jid)

    // Then poll every 2 seconds
    const interval = setInterval(() => fetchJobStatus(jid), 2000)
    setPollingInterval(interval)
  }

  const fetchJobStatus = async (jid) => {
    try {
      const [statusRes, filesRes, summaryRes] = await Promise.all([
        axios.get(`${API_BASE}/api/batch/status/${jid}`),
        axios.get(`${API_BASE}/api/batch/files/${jid}`),
        axios.get(`${API_BASE}/api/batch/summary/${jid}`),
      ])

      setJobStatus(statusRes.data)
      setJobFiles(filesRes.data.files)

      // Stop polling when done
      if (statusRes.data.status === 'done' || statusRes.data.status === 'failed') {
        if (pollingInterval) clearInterval(pollingInterval)
      }
    } catch (error) {
      console.error('Polling error:', error)
    }
  }

  // Download CSV
  const handleDownloadCsv = async () => {
    if (!jobId) return
    setDownloadingCsv(true)
    try {
      const response = await axios.get(`${API_BASE}/api/batch/download-csv/${jobId}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `batch_${jobId.slice(0, 8)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.parentElement.removeChild(link)
      toast.success('CSV downloaded!')
    } catch (error) {
      toast.error(`Download failed: ${error.message}`)
    } finally {
      setDownloadingCsv(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Batch Processing</h1>
        <p className="text-gray-600 mb-8">Process multiple invoices efficiently</p>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-300">
          <button
            onClick={() => setActiveTab('upload')}
            className={clsx(
              'px-6 py-3 font-medium transition',
              activeTab === 'upload'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            )}
          >
            📤 Upload Files
          </button>
          <button
            onClick={() => setActiveTab('daterange')}
            className={clsx(
              'px-6 py-3 font-medium transition',
              activeTab === 'daterange'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            )}
          >
            📅 Date Range
          </button>
          {jobId && (
            <button
              onClick={() => setActiveTab('results')}
              className={clsx(
                'px-6 py-3 font-medium transition',
                activeTab === 'results'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-600 hover:text-gray-800'
              )}
            >
              📊 Results
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Files</h2>

              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={clsx(
                  'border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer',
                  isDragActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 bg-gray-50 hover:border-indigo-400'
                )}
              >
                <input {...getInputProps()} />
                <div className="text-5xl mb-4">📁</div>
                <p className="text-lg font-medium text-gray-700">
                  {isDragActive ? 'Drop files here' : 'Drag files here or click to select'}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Supported: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP (max 50 files)
                </p>
              </div>

              {/* File List */}
              {uploadedFiles.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">
                    {uploadedFiles.length} file(s) selected
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {uploadedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-100 rounded">
                        <span className="text-gray-700">{file.name}</span>
                        <span className="text-sm text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <div className="mt-8 flex gap-4">
                <button
                  onClick={handleBatchUpload}
                  disabled={uploadedFiles.length === 0 || isUploading}
                  className={clsx(
                    'px-8 py-3 rounded-lg font-semibold transition',
                    uploadedFiles.length === 0 || isUploading
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  )}
                >
                  {isUploading ? 'Uploading...' : `Start Batch (${uploadedFiles.length})`}
                </button>
                <button
                  onClick={() => setUploadedFiles([])}
                  className="px-8 py-3 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Date Range Tab */}
          {activeTab === 'daterange' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Process by Date Range</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={e => setDateStart(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={e => setDateEnd(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                onClick={handleDateRange}
                className="w-full px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition mb-8"
              >
                Process Date Range
              </button>

              <hr className="my-8" />

              <h3 className="text-lg font-semibold text-gray-700 mb-4">Quick Filters</h3>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => handleQuickFilter('today')}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition"
                >
                  📅 Today
                </button>
                <button
                  onClick={() => handleQuickFilter('week')}
                  className="px-6 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition"
                >
                  📆 This Week
                </button>
                <button
                  onClick={() => handleQuickFilter('month')}
                  className="px-6 py-3 bg-purple-500 text-white rounded-lg font-semibold hover:bg-purple-600 transition"
                >
                  📋 This Month
                </button>
              </div>
            </div>
          )}

          {/* Results Tab */}
          {activeTab === 'results' && jobStatus && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Batch Results</h2>

              {/* Summary Card */}
              <div className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg p-6 mb-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm opacity-90">Total Files</p>
                    <p className="text-3xl font-bold">{jobStatus.total_files}</p>
                  </div>
                  <div>
                    <p className="text-sm opacity-90">Processed</p>
                    <p className="text-3xl font-bold">{jobStatus.processed_files}</p>
                  </div>
                  <div>
                    <p className="text-sm opacity-90">Failed</p>
                    <p className="text-3xl font-bold">{jobStatus.failed_files}</p>
                  </div>
                  <div>
                    <p className="text-sm opacity-90">Progress</p>
                    <p className="text-3xl font-bold">{jobStatus.progress_percent}%</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-6 bg-white/20 rounded-full h-3 overflow-hidden">
                  <div
                    style={{ width: `${jobStatus.progress_percent}%` }}
                    className="h-full bg-white transition-all duration-300"
                  />
                </div>

                <p className="mt-4 text-sm">
                  Status: <span className="font-bold uppercase">{jobStatus.status}</span>
                </p>
              </div>

              {/* Download CSV Button */}
              {jobStatus.status === 'done' && (
                <button
                  onClick={handleDownloadCsv}
                  disabled={downloadingCsv}
                  className={clsx(
                    'w-full px-6 py-3 rounded-lg font-semibold transition mb-8',
                    downloadingCsv
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  )}
                >
                  {downloadingCsv ? 'Downloading...' : '📥 Download All Results as CSV'}
                </button>
              )}

              {/* Files Table */}
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Files</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b border-gray-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Filename</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Language</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Confidence</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Routing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobFiles.map((file, idx) => (
                      <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{file.filename}</td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'px-3 py-1 rounded-full text-xs font-semibold',
                              file.status === 'done'
                                ? 'bg-green-100 text-green-800'
                                : file.status === 'processing'
                                  ? 'bg-blue-100 text-blue-800'
                                  : file.status === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                            )}
                          >
                            {file.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {file.language_detected || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {file.confidence_score ? file.confidence_score.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{file.routing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

