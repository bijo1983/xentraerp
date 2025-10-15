// src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import QueryProvider from './components/ui/QueryProvider';

const container = document.getElementById('root');
if (!container) throw new Error('Root #root not found');

const root = createRoot(container);

const Spinner = (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
      <p className="text-gray-600">🔄 Loading Badminton Booking...</p>
    </div>
  </div>
);

root.render(
  <React.StrictMode>
    <QueryProvider>
      <React.Suspense fallback={Spinner}>
        <App />
      </React.Suspense>
    </QueryProvider>
  </React.StrictMode>
);
