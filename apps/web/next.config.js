/** @type {import('next').NextConfig} */
const API_INTERNAL = 'http://localhost:4000';

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
