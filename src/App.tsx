import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./hooks/useLanguage";
import { AuthProvider } from "./hooks/useAuth";
import { AppLayout } from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { EquipmentProvider } from "./contexts/EquipmentContext";
import Index from "./pages/Index";
import PartsManagement from "./pages/PartsManagement";
import EmpowerManagement from "./pages/EmpowerManagement";
import PermissionManagement from "./pages/PermissionManagement";
import MaintenanceDashboard from "./pages/MaintenanceDashboard";
import CalibrationDashboard from "./pages/CalibrationDashboard";
import PiChat from "./pages/PiChat";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <EquipmentProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <AppLayout>
                    <Index />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="/maintenance" element={
                <ProtectedRoute>
                  <AppLayout>
                    <MaintenanceDashboard />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="/calibration" element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalibrationDashboard />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="/parts" element={
                <ProtectedRoute>
                  <AppLayout>
                    <PartsManagement />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="/empower" element={
                <ProtectedRoute>
                  <AppLayout>
                    <EmpowerManagement />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="/pi" element={
                <ProtectedRoute>
                  <AppLayout>
                    <PiChat />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="/permissions" element={
                <ProtectedRoute requireAdmin>
                  <AppLayout>
                    <PermissionManagement />
                  </AppLayout>
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </EquipmentProvider>
        </TooltipProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

