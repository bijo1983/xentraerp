// src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';                // ✅ make sure this line exists
import App from './App';
import { SiteSettingsProvider } from './hooks/useSiteSettings';

const container = document.getElementById('root');
if (!container) throw new Error('Root #root not found');

const root = createRoot(container);

const Spinner = (
  <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background-tint to-secondary-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
      <p className="text-text-secondary">🔄 Loading Badminton Booking...</p>
    </div>
  </div>
);

root.render(
  <React.StrictMode>
    <SiteSettingsProvider>
      <React.Suspense fallback={Spinner}>
        <App />
      </React.Suspense>
    </SiteSettingsProvider>
  </React.StrictMode>
);
