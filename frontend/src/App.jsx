import { Navigate, Route, HashRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./api/auth";
import { ToastProvider } from "./components/Toast";
import { AlertStreamProvider } from "./stream/AlertStream";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AlertList from "./pages/AlertList";
import AlertDetail from "./pages/AlertDetail";
import Simulator from "./pages/Simulator";
import ModelLab from "./pages/ModelLab";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Logs from "./pages/Logs";

function RequireAuth({ children, role }) {
  const { token, user, ready } = useAuth();
  if (!ready) return null;
  if (!token) return <Navigate to="/login" replace />;
  if (role && user && user.role !== role) return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

const guarded = (element, role) => <RequireAuth role={role}>{element}</RequireAuth>;

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={guarded(<Dashboard />)} />
      <Route path="/alerts" element={guarded(<AlertList />)} />
      <Route path="/alerts/:id" element={guarded(<AlertDetail />)} />
      <Route path="/simulator" element={guarded(<Simulator />)} />
      <Route path="/model" element={guarded(<ModelLab />)} />
      <Route path="/reports" element={guarded(<Reports />)} />
      <Route path="/users" element={guarded(<Users />, "ADMIN")} />
      <Route path="/logs" element={guarded(<Logs />, "ADMIN")} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <AlertStreamProvider>
            <AppRoutes />
          </AlertStreamProvider>
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}
