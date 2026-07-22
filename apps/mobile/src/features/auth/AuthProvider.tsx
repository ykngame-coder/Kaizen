import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAuthBackend,
  type AuthBackend,
  type AuthUser,
  type OAuthProvider,
  type SignUpResult,
} from './authClient';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  mode: AuthBackend['mode'];
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the auth session. Resolves the initial session, then tracks changes.
 * Backend is chosen once (Supabase vs demo) and kept stable for the app's life.
 */
export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const backendRef = useRef<AuthBackend | undefined>(undefined);
  if (!backendRef.current) backendRef.current = createAuthBackend();
  const backend = backendRef.current;

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    backend
      .getUser()
      .then((u) => {
        if (!active) return;
        setUser(u);
        setStatus(u ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => active && setStatus('unauthenticated'));

    const unsubscribe = backend.onChange((u) => {
      setUser(u);
      setStatus(u ? 'authenticated' : 'unauthenticated');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      mode: backend.mode,
      signUp: backend.signUp,
      signIn: backend.signIn,
      signInWithOAuth: backend.signInWithOAuth,
      signOut: backend.signOut,
    }),
    [status, user, backend],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
