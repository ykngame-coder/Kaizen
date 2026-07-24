import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { secureStorage } from '@/lib/secure-storage';
import { getSupabase } from '@/lib/supabase';

// Closes the in-app browser tab once the OAuth redirect lands (web only; no-op
// on native, but required for the web flow to resolve openAuthSessionAsync).
WebBrowser.maybeCompleteAuthSession();

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthMode = 'supabase' | 'demo';
export type OAuthProvider = 'apple' | 'google';

/**
 * Backend-agnostic auth surface. A real Supabase implementation is used when
 * credentials are present; otherwise a local demo backend keeps the full
 * sign-in → onboarding → app flow usable without a server (dev/preview).
 */
export interface SignUpResult {
  /** True when the provider requires e-mail confirmation before first sign-in. */
  needsConfirmation: boolean;
}

export interface AuthBackend {
  mode: AuthMode;
  getUser(): Promise<AuthUser | null>;
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<void>;
  signInWithOAuth(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DEMO_KEY = 'supotsu.demo.user';

/** In-memory + SecureStore demo backend. Accepts any credentials. */
function createDemoBackend(): AuthBackend {
  const listeners = new Set<(user: AuthUser | null) => void>();
  const emit = (user: AuthUser | null) => listeners.forEach((cb) => cb(user));

  const persist = async (user: AuthUser | null) => {
    if (user) await secureStorage.setItem(DEMO_KEY, JSON.stringify(user));
    else await secureStorage.removeItem(DEMO_KEY);
  };

  return {
    mode: 'demo',
    async getUser() {
      const raw = await secureStorage.getItem(DEMO_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signUp(email) {
      const user = { id: randomId(), email };
      await persist(user);
      emit(user);
      return { needsConfirmation: false };
    },
    async signIn(email) {
      const user = { id: randomId(), email };
      await persist(user);
      emit(user);
    },
    async signInWithOAuth(provider) {
      const user = { id: randomId(), email: `demo@${provider}.supotsu` };
      await persist(user);
      emit(user);
    },
    async signOut() {
      await persist(null);
      emit(null);
    },
  };
}

/** Supabase-backed implementation. */
function createSupabaseBackend(client: NonNullable<ReturnType<typeof getSupabase>>): AuthBackend {
  const toUser = (u: { id: string; email?: string } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? '' } : null;

  return {
    mode: 'supabase',
    async getUser() {
      const { data } = await client.auth.getUser();
      return toUser(data.user);
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        cb(toUser(session?.user));
      });
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      // No session returned ⇒ the project requires e-mail confirmation.
      return { needsConfirmation: !data.session };
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signInWithOAuth(provider) {
      // Web: full-page redirect. A popup + openAuthSessionAsync trips the
      // Cross-Origin-Opener-Policy (can't observe window.closed), so let the
      // browser navigate to the provider and back; detectSessionInUrl (enabled
      // on web) completes the session on return.
      if (Platform.OS === 'web') {
        const { error } = await client.auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
        return; // page navigates away
      }

      // Native: open the provider in an in-app browser and exchange the code.
      const redirectTo = AuthSession.makeRedirectUri({ path: 'auth/callback' });
      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Aucune URL d'authentification reçue.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return; // user cancelled or dismissed — not an error

      const code = new URL(result.url).searchParams.get('code');
      if (!code) throw new Error("Réponse d'authentification invalide.");

      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
}

/** Picks the real backend when Supabase is configured, else the demo backend. */
export function createAuthBackend(): AuthBackend {
  const client = getSupabase();
  return client ? createSupabaseBackend(client) : createDemoBackend();
}
