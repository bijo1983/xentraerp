/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Self-hosted without `sharp` installed — the built-in optimizer's
    // /_next/image endpoint 400s on every request without it. These are
    // small local brand assets that don't need server-side resizing.
    unoptimized: true,
  },
};

module.exports = nextConfig;
