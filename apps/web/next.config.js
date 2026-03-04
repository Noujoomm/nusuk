/** @type {import('next').NextConfig} */
const API_DEST = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

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
        destination: `${API_DEST}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${API_DEST}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
