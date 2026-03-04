/** @type {import('next').NextConfig} */
const API_INTERNAL = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${API_INTERNAL}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
