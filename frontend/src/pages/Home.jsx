import React, { useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'
import clsx from 'clsx'

const API_BASE = 'http://localhost:8000'

export default function Home() {
  const [file, setFile] = useState(null)
  const [language, setLanguage] = useState('auto')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(0)

  const onDrop = React.useCallback(acceptedFiles => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      toast.success(`File selected: ${acceptedFiles[0].name}`)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp']
    }
  })

  const handleProcess = async () => {
    if (!file) {
      toast.error('Please select a file first')
      return
    }

    setIsProcessing(true)
    setProgress(0)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', language)
      formData.append('model', 'llama3')

      const response = await axios.post(`${API_BASE}/api/process`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const percent = Math.round((e.loaded / e.total) * 100)
          setProgress(percent)
        }
      })

      setResult(response.data)
      toast.success('Processing complete!')
    } catch (error) {
      toast.error(`Error: ${error.response?.data?.detail || error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">OCR Invoice Processor</h1>
        <p className="text-gray-600 mb-8">Extract data from invoices using AI</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Invoice</h2>

            <div
              {...getRootProps()}
              className={clsx(
                'border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer mb-6',
                isDragActive
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300 bg-gray-50 hover:border-indigo-400'
              )}
            >
              <input {...getInputProps()} />
              <div className="text-5xl mb-4">📄</div>
              <p className="text-lg font-medium text-gray-700">
                {isDragActive ? 'Drop file here' : 'Drag file or click to select'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supported: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP
              </p>
            </div>

            {file && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <p className="font-medium text-gray-700">📁 {file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="auto">Auto Detect</option>
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
                <option value="tamil">Tamil</option>
                <option value="telugu">Telugu</option>
                <option value="bengali">Bengali</option>
              </select>
            </div>

            <button
              onClick={handleProcess}
              disabled={!file || isProcessing}
              className={clsx(
                'w-full px-6 py-3 rounded-lg font-semibold transition',
                !file || isProcessing
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              )}
            >
              {isProcessing ? `Processing (${progress}%)` : 'Process Invoice'}
            </button>
          </div>

          {/* Results Section */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Results</h2>

            {!result ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="text-6xl mb-4">🔍</div>
                <p>Upload and process an invoice to see results</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div className="p-4 bg-gradient-to-r from-indigo-100 to-blue-100 rounded-lg">
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="text-2xl font-bold text-indigo-600">{result.routing}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Confidence</p>
                    <p className="text-xl font-bold text-gray-800">
                      {(result.confidence_score * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Language</p>
                    <p className="text-xl font-bold text-gray-800">
                      {result.language_detected || '—'}
                    </p>
                  </div>
                </div>

                {result.invoice_number && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Invoice Number</p>
                    <p className="text-lg font-semibold text-gray-800">{result.invoice_number}</p>
                  </div>
                )}

                {result.total_amount && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-lg font-semibold text-gray-800">{result.total_amount}</p>
                  </div>
                )}

                {result.vendor_name && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Vendor</p>
                    <p className="text-lg font-semibold text-gray-800">{result.vendor_name}</p>
                  </div>
                )}

                {result.line_items && result.line_items.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">Line Items ({result.line_items.length})</p>
                    <div className="space-y-1 text-sm">
                      {result.line_items.slice(0, 3).map((item, idx) => (
                        <p key={idx} className="text-gray-700">
                          {item.description || item.item} - {item.amount}
                        </p>
                      ))}
                      {result.line_items.length > 3 && (
                        <p className="text-gray-500 text-xs">+{result.line_items.length - 3} more</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 pt-4 border-t">
                  ⏱️ Processed in {result.processing_time_seconds}s | 🔧 {result.ocr_engine}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
