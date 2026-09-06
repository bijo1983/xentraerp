/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/method/:path*',
        destination: `${process.env.ERP_BACKEND_URL}/api/method/:path*`,
      },
      {
        source: '/api/resource/:path*',
        destination: `${process.env.ERP_BACKEND_URL}/api/resource/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
