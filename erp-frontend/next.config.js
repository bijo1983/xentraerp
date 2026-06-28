/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const erpUrl = process.env.NEXT_PUBLIC_ERP_URL;
    if (!erpUrl) return [];
    return [
      {
        source: '/api/method/:path*',
        destination: `${erpUrl}/api/method/:path*`,
      },
      {
        source: '/api/resource/:path*',
        destination: `${erpUrl}/api/resource/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
