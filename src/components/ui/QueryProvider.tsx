  // src/components/ui/QueryProvider.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // ✅ Stop refresh on tab focus
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 60 * 1000, // 1 minute cache
    },
    mutations: {
      retry: 0,
    },
  },
});

interface Props {
  children: React.ReactNode;
}

const QueryProvider: React.FC<Props> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

export default QueryProvider;
