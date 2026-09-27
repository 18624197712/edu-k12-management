import { Spin } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, setAccessToken } from './api';
import type { User } from './types';

type AuthValue = { user?: User; ready: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>();
  const [ready, setReady] = useState(false);
  useEffect(() => { api.post('/auth/refresh').then(({ data }) => { setAccessToken(data.data.accessToken); setUser(data.data.user); }).catch(() => undefined).finally(() => setReady(true)); }, []);
  const value = useMemo<AuthValue>(() => ({
    user, ready,
    login: async (email, password) => { const { data } = await api.post('/auth/login', { email, password }); setAccessToken(data.data.accessToken); setUser(data.data.user); },
    logout: async () => { await api.post('/auth/logout'); setAccessToken(); setUser(undefined); },
  }), [user, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is missing'); return value; }
export function ProtectedRoute() {
  const { user, ready } = useAuth(); const location = useLocation();
  if (!ready) return <div className="auth-loading"><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
