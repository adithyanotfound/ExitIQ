import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Form from './pages/Form'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [valuation, setValuation] = useState<any>(null)

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/valuate" element={<Form onResult={setValuation} />} />
        <Route path="/dashboard" element={
          valuation ? <Dashboard data={valuation} /> : <Navigate to="/valuate" replace />
        } />
      </Routes>
    </div>
  )
}
