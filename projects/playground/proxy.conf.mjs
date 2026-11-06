/**
 * Dev proxy of the playground: `/api/*` → nest-server (default http://localhost:3000), `/api` prefix stripped.
 * Same-origin requests keep the session cookie and WebAuthn working on localhost:3001.
 */
const target = process.env.NG_API_URL || process.env.NG_PUBLIC_API_URL || 'http://localhost:3000';

export default {
  '/api': {
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    secure: false,
    target,
  },
};
