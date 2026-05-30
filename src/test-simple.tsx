import React from 'react'
import { createRoot } from 'react-dom/client'

function Test() {
  return <div style={{padding: 50, fontFamily: 'sans-serif'}}>
    <h1>✅ React is working!</h1>
    <p>If you see this, the basic setup is correct.</p>
  </div>
}

createRoot(document.getElementById("root")!).render(<Test />)
