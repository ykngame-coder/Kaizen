import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { createProfileStore, type OnboardingData, type ProfileStore } from './profileStore';

type OnboardingStatus = 'loading' | 'needed' | 'done';

interface OnboardingContextValue {
  status: OnboardingStatus;
  complete: (data: OnboardingData) => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Tracks whether the signed-in user has completed onboarding. Re-evaluates on
 * every user change so routing can gate onboarding vs. the main app.
 */
export function OnboardingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user, status: authStatus } = useAuth();
  const storeRef = useRef<ProfileStore>();
  if (!storeRef.current) storeRef.current = createProfileStore();
  const store = storeRef.current;

  const [status, setStatus] = useState<OnboardingStatus>('loading');

  useEffect(() => {
    let active = true;
    if (authStatus !== 'authenticated' || !user) {
      setStatus('loading');
      return;
    }
    setStatus('loading');
    store
      .isOnboarded(user.id)
      .then((done) => active && setStatus(done ? 'done' : 'needed'))
      .catch(() => active && setStatus('needed'));
    return () => {
      active = false;
    };
  }, [user, authStatus, store]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      status,
      complete: async (data) => {
        if (!user) return;
        await store.completeOnboarding(user.id, data);
        setStatus('done');
      },
    }),
    [status, user, store],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}
