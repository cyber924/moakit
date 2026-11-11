/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  outputFileTracingIncludes: { '/': ['./src/site.html'] },
  experimental: { proxyClientMaxBodySize: '12mb' },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};
export default config;
