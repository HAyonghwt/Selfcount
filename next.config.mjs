/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // 개발 환경 최적화
  experimental: {
    // 파일 시스템 캐시 개선
    optimizePackageImports: ['lucide-react'],
  },
  // 웹팩 설정 개선
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // 개발 환경에서 캐시 최적화
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [import.meta.url],
        },
        cacheDirectory: process.cwd() + '/.next/cache',
        maxAge: 172800000, // 2일
      };
    }
    return config;
  },
  // 개발 서버 설정 (deprecated 제거)
};

export default nextConfig;
