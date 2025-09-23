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
      // 개발 환경에서는 청크 분할 비활성화 (Windows 호환성)
      config.optimization = {
        ...config.optimization,
        splitChunks: false,
      };
      
      // 캐시 설정 (Windows 호환성 개선)
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [process.cwd() + '/next.config.mjs'],
        },
        cacheDirectory: process.cwd() + '/.next/cache',
        maxAge: 86400000, // 1일로 단축
        compression: false, // Windows에서 압축 문제 방지
      };
    }
    return config;
  },
  // 개발 서버 설정 (deprecated 제거)
};

export default nextConfig;
