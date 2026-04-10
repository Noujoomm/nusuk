/** @type {import('next').NextConfig} */
const API_INTERNAL = process.env.API_INTERNAL_URL || 'http://localhost:4000';

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
  // Increase proxy timeout for large file uploads
  httpAgentOptions: {
    keepAlive: true,
  },
  experimental: {
    proxyTimeout: 600000, // 10 minutes
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${API_INTERNAL}/uploads/:path*`,
      },
      {
        source: '/health',
        destination: `${API_INTERNAL}/health`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${API_INTERNAL}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
