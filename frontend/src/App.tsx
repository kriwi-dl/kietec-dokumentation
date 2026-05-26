import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Login } from './pages/Login';
import { AuftraegeList } from './pages/AuftraegeList';
import { AuftragDetail } from './pages/AuftragDetail';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Lädt …
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/" element={<ProtectedRoute><AuftraegeList /></ProtectedRoute>} />
          <Route path="/auftraege/:id" element={<ProtectedRoute><AuftragDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}