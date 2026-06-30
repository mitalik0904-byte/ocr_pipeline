import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Home from './pages/Home'
import BatchProcessing from './pages/BatchProcessing'

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white shadow-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold text-indigo-600">
              🏢 OCR Pipeline
            </Link>
            <div className="flex gap-6">
              <Link
                to="/"
                className="text-gray-700 hover:text-indigo-600 font-medium transition"
              >
                Single File
              </Link>
              <Link
                to="/batch"
                className="text-gray-700 hover:text-indigo-600 font-medium transition"
              >
                Batch Processing
              </Link>
            </div>
          </div>
        </nav>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/batch" element={<BatchProcessing />} />
        </Routes>

        {/* Notifications */}
        <Toaster position="bottom-right" />
      </div>
    </Router>
  )
}

