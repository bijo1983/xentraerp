/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/method/:path*',
        destination: `${process.env.NEXT_PUBLIC_ERP_URL}/api/method/:path*`,
      },
      {
        source: '/api/resource/:path*',
        destination: `${process.env.NEXT_PUBLIC_ERP_URL}/api/resource/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
