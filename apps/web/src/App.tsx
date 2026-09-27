import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { ModulePage } from './pages/ModulePage';
import { Login } from './pages/Login';
import { ProtectedRoute } from './auth';
import { StudentDetail } from './pages/StudentDetail';
import { Todos } from './pages/Todos';

export function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:id" element={<StudentDetail />} />
        <Route path="/:module" element={<ModulePage />} />
        <Route index element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Route>
  </Routes>;
}
