import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'

export const BUILD_TAG = '1.0.1'
import { api } from './api'
import { Spinner, ToastProvider } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inbox from './pages/Inbox'
import Connections from './pages/Connections'
import Knowledge from './pages/Knowledge'
import Insights from './pages/Insights'
import Home from './pages/Home'

function App() {
  const [me, setMe] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    api<{ email: string }>('/me').then((r) => setMe(r.email)).catch(() => setMe(null))
    const h = () => setMe(null)
    window.addEventListener('fd:unauthorized', h)
    return () => window.removeEventListener('fd:unauthorized', h)
  }, [])

  if (me === undefined) return <div className="grid h-full place-items-center"><Spinner /></div>
  if (!me) return <Login onSignedIn={setMe} />

  return (
    <Routes>
      <Route element={<Layout email={me} onSignOut={() => setMe(null)} />}>
        <Route index element={<Home email={me} />} />
        <Route path="/inbox" element={<Navigate to="/inbox/reply" replace />} />
        <Route path="/inbox/:view" element={<Inbox />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/knowledge-base" element={<Knowledge />} />
        <Route path="/help-center" element={<Navigate to="/knowledge-base" replace />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
