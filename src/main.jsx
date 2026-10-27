import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { aplicarMarca } from './lib/theme'

// last clinic color seen on this device, applied before the session loads
try { const c = localStorage.getItem('ch-color'); if (c) aplicarMarca(c) } catch { /* private window */ }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
