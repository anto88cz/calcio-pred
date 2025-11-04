/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone per Docker
  output: 'standalone',
  
  // Configurazione API
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },

  // Ottimizzazioni
  reactStrictMode: true,
  swcMinify: true,

  // Configurazione immagini
  images: {
    domains: ['media.api-sports.io'], // Per loghi squadre da API-FOOTBALL
    formats: ['image/avif', 'image/webp'],
  },

  // Headers di sicurezza
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },

  // Variables d'ambiente pubbliche
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Calcio-Pred',
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  },
};

module.exports = nextConfig;
