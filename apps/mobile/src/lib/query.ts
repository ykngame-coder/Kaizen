import { QueryClient } from '@tanstack/react-query';

/** Shared React Query client. Offline-first defaults (Master Prompt P2 offline). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
