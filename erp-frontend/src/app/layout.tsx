import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'XentraERP - Modular Enterprise Resource Planning',
  description: 'Next-generation modular ERP platform with configurable logistics, accounting, inventory, and CRM modules.',
  icons: {
    icon: '/favicon.svg',
  },
};

// System font stack — avoids build-time network fetch of Google Fonts
// (the server can't reach fonts.gstatic.com) while keeping a modern look.
const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: fontStack }}>{children}</body>
    </html>
  );
}
