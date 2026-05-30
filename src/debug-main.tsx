import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const log = (msg: string) => {
  console.log('DEBUG:', msg)
}

function DebugApp() {
  const [steps, setSteps] = useState<{label: string, status: 'pending'|'ok'|'fail', detail?: string}[]>([
    { label: 'Step 1: React rendering', status: 'ok' },
    { label: 'Step 2: Tailwind CSS', status: 'pending' },
    { label: 'Step 3: Supabase client', status: 'pending' },
    { label: 'Step 4: Supabase Auth', status: 'pending' },
    { label: 'Step 5: Full App import', status: 'pending' },
  ])

  useEffect(() => {
    log('DebugApp mounted')

    // Step 2: Check Tailwind
    const hasTailwind = document.querySelector('.bg-red-500') !== null
    updateStep(1, 'ok', 'Tailwind loaded via index.css')

    // Step 3: Dynamic import Supabase
    import('@/integrations/supabase/client').then(m => {
      log('Supabase client loaded')
      updateStep(2, 'ok', 'Client created: ' + typeof m.supabase)

      // Step 4: Check auth
      m.supabase.auth.getSession().then(({ data }) => {
        log('Auth getSession:', data.session ? 'session found' : 'no session')
        updateStep(3, 'ok', data.session ? 'Session exists' : 'No session (need login)')

        // Step 5: Try full App
        import('./App').then(() => {
          log('App module loaded successfully')
          updateStep(4, 'ok', 'App imports resolved')
        }).catch(e => {
          log('App import FAILED: ' + e.message)
          updateStep(4, 'fail', e.message)
        })
      }).catch(e => {
        log('Auth FAILED: ' + e.message)
        updateStep(3, 'fail', e.message)
      })
    }).catch(e => {
      log('Supabase client FAILED: ' + e.message)
      updateStep(2, 'fail', e.message)
    })
  }, [])

  const updateStep = (index: number, status: 'ok'|'fail', detail?: string) => {
    setSteps(prev => {
      const next = [...prev]
      next[index] = { ...next[index], status, detail }
      return next
    })
  }

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>🔍 Lab QR Manager - Debug Mode</h1>
      {steps.map((step, i) => (
        <div key={i} style={{
          padding: '12px 16px',
          margin: '8px 0',
          borderRadius: 8,
          background: step.status === 'ok' ? '#f0fff4' : step.status === 'fail' ? '#fff5f5' : '#f7fafc',
          border: `1px solid ${step.status === 'ok' ? '#9ae6b4' : step.status === 'fail' ? '#feb2b2' : '#e2e8f0'}`,
        }}>
          <span style={{ marginRight: 8 }}>
            {step.status === 'pending' ? '⏳' : step.status === 'ok' ? '✅' : '❌'}
          </span>
          <strong>{step.label}</strong>
          {step.status === 'pending' && <span style={{ color: '#718096', marginLeft: 8 }}>testing...</span>}
          {step.detail && <div style={{ fontSize: 12, color: '#4a5568', marginTop: 4 }}>{step.detail}</div>}
        </div>
      ))}
      <p style={{ marginTop: 24, color: '#718096', fontSize: 14 }}>
        Also check browser console (F12 → Console) for detailed logs.
      </p>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DebugApp />
  </React.StrictMode>
)
