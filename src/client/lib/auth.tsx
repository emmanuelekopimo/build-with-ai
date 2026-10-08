import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '../../shared/constants';
import { can, type Permission } from '../../shared/permissions';
import { api, ApiError, onActivity, onUnauthorized, setCsrfToken } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  office: string;
}

interface MeResponse {
  user: User;
  csrfToken: string;
  sessionExpiresAt: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  sessionEnded: boolean;
  /** Milliseconds of idle time the server allows before a session ends. */
  idleMs: number;
  lastActivity: number;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  touch: () => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [idleMs, setIdleMs] = useState(8 * 3600000);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const accept = useCallback((r: MeResponse) => {
    setUser(r.user);
    setCsrfToken(r.csrfToken);
    setIdleMs(Math.max(60000, new Date(r.sessionExpiresAt).getTime() - Date.now()));
    setLastActivity(Date.now());
    setSessionEnded(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      accept(await api<MeResponse>('/auth/me'));
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      setUser(null);
      setCsrfToken(null);
    }
  }, [accept]);

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(
    () =>
      onUnauthorized(() => {
        if (userRef.current) setSessionEnded(true);
        setUser(null);
        setCsrfToken(null);
      }),
    [],
  );

  useEffect(() => {
    let last = 0;
    return onActivity(() => {
      const now = Date.now();
      if (now - last > 60000) {
        last = now;
        setLastActivity(now);
      }
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      sessionEnded,
      idleMs,
      lastActivity,
      login: async (email, password) => {
        accept(await api<MeResponse>('/auth/login', { body: { email, password } }));
      },
      logout: async () => {
        try {
          await api('/auth/logout', { body: {} });
        } finally {
          setUser(null);
          setCsrfToken(null);
        }
      },
      refresh,
      touch: () => setLastActivity(Date.now()),
      can: (p) => can(user?.role, p),
    }),
    [user, loading, sessionEnded, idleMs, lastActivity, accept, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
