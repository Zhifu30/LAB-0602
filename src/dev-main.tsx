import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { LanguageProvider } from '@/hooks/useLanguage'
import { AuthProvider } from '@/hooks/useAuth'
import './index.css'

import { AppLayout } from './components/AppLayout'
import Index from './pages/Index'
import PartsManagement from './pages/PartsManagement'
import EmpowerManagement from './pages/EmpowerManagement'
import MaintenanceDashboard from './pages/MaintenanceDashboard'
import PermissionManagement from './pages/PermissionManagement'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient()

function DevApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AppLayout><Index /></AppLayout>} />
                <Route path="/maintenance" element={<AppLayout><MaintenanceDashboard /></AppLayout>} />
                <Route path="/parts" element={<AppLayout><PartsManagement /></AppLayout>} />
                <Route path="/empower" element={<AppLayout><EmpowerManagement /></AppLayout>} />
                <Route path="/permissions" element={<AppLayout><PermissionManagement /></AppLayout>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DevApp />
  </React.StrictMode>
)
