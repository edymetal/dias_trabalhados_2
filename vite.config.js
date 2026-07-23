import { defineConfig } from 'vite';

export function createContentSecurityPolicy(mode = 'production') {
  const connections = [
    "'self'",
    'https://accounts.google.com',
    'https://firebaseappcheck.googleapis.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://www.google.com',
    'https://www.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://*.firebasedatabase.app',
    'wss://*.firebasedatabase.app'
  ];

  if (mode === 'test') {
    connections.push(
      'http://127.0.0.1:9000',
      'http://127.0.0.1:9099',
      'ws://127.0.0.1:9000'
    );
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connections.join(' ')}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    "form-action 'self'",
    "frame-src 'self' https://accounts.google.com https://apis.google.com https://www.google.com https://*.firebaseapp.com",
    "img-src 'self' data: https://*.googleusercontent.com https://www.gravatar.com https://www.gstatic.com",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self' https://apis.google.com https://www.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "worker-src 'self' blob:"
  ].join('; ');
}

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    target: 'es2022'
  },
  plugins: [
    {
      name: 'content-security-policy',
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: createContentSecurityPolicy(mode)
          },
          injectTo: 'head-prepend'
        }];
      }
    }
  ]
}));
