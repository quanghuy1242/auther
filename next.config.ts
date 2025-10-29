import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  crossOrigin: 'anonymous',
  
  experimental: {
    // Enable Turbopack file system caching for development
    turbopackFileSystemCacheForDev: true,

    optimizePackageImports: [
      '@headlessui/react',
      'react-hook-form',
    ],
  },
  
  // Turbopack configuration (Next.js 16+ default)
  turbopack: {
    resolveAlias: {
      '@material-symbols/font-400$': '@material-symbols/font-400/outlined.css',
    },
  },
  
  // Webpack fallback for non-Turbopack builds
  webpack: (config, { isServer }) => {
    // Material Symbols tree-shaking
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@material-symbols/font-400$'] = 
      '@material-symbols/font-400/outlined.css';
    
    return config;
  },
};

// Bundle analyzer (optional, run with ANALYZE=true pnpm build)
if (process.env.ANALYZE === 'true') {
  const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: true,
  });
  module.exports = withBundleAnalyzer(nextConfig);
}

export default nextConfig;
