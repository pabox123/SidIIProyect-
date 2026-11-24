import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStore } from '../api/client';
import { authApi } from '../api/endpoints';
import type { AdminUser, Me, Profile } from '../api/types';

type Session =
  | { kind: 'none' }
  | { kind: 'client'; me: Me }
  | { kind: 'admin'; admin: AdminUser };

interface AuthValue {
  session: Session;
  loading: boolean;
  activeProfile: Profile | null;
  loginClient: (email: string, password: string) => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  selectProfile: (profile: Profile) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const ADMIN_KEY = 'cineconecta.admin';
const PROFILE_KEY = 'cineconecta.profile';

const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: 'none' });
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<number | null>(() => Number(read(PROFILE_KEY)) || null);

  const logout = useCallback(() => {
    tokenStore.set(null);
    write(ADMIN_KEY, null);
    write(PROFILE_KEY, null);
    setProfileId(null);
    setSession({ kind: 'none' });
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await authApi.me();
    setSession({ kind: 'client', me });
  }, []);

  // Restaurar la sesión al recargar la página
  useEffect(() => {
    const token = tokenStore.get();
    const savedAdmin = read(ADMIN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    if (savedAdmin) {
      setSession({ kind: 'admin', admin: JSON.parse(savedAdmin) });
      setLoading(false);
      return;
    }
    refreshMe()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [refreshMe, logout]);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('cineconecta:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cineconecta:unauthorized', onUnauthorized);
  }, [logout]);

  const loginClient = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await authApi.login(email, password);
      tokenStore.set(accessToken);
      write(ADMIN_KEY, null);
      write(PROFILE_KEY, null);
      setProfileId(null);
      try {
        await refreshMe();
      } catch (error) {
        tokenStore.set(null);
        throw error;
      }
    },
    [refreshMe],
  );

  const loginAdmin = useCallback(async (email: string, password: string) => {
    const { accessToken, admin } = await authApi.adminLogin(email, password);
    tokenStore.set(accessToken);
    write(ADMIN_KEY, JSON.stringify(admin));
    write(PROFILE_KEY, null);
    setProfileId(null);
    setSession({ kind: 'admin', admin });
  }, []);

  const selectProfile = useCallback((profile: Profile) => {
    write(PROFILE_KEY, String(profile.profileId));
    setProfileId(profile.profileId);
  }, []);

  const activeProfile = useMemo(() => {
    if (session.kind !== 'client' || !profileId) return null;
    return session.me.profiles.find((p) => p.profileId === profileId && p.isActive) ?? null;
  }, [session, profileId]);

  const value = useMemo(
    () => ({ session, loading, activeProfile, loginClient, loginAdmin, selectProfile, refreshMe, logout }),
    [session, loading, activeProfile, loginClient, loginAdmin, selectProfile, refreshMe, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
