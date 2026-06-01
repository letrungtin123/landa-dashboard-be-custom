import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // loadEnv với prefix '' để đọc được cả PROXY_* (không có prefix VITE_)
  // PROXY_* không bị bake vào browser bundle vì không có prefix VITE_
  const env = loadEnv(mode, process.cwd(), '');

  // Proxy targets — dùng PROXY_* để tách biệt khỏi VITE_* client vars
  // Fallback về IP thật của LMS/CMS khi không có biến môi trường
  const lmsProxyTarget = env.PROXY_OPENEDX_LMS_URL || 'http://192.168.0.226.nip.io';
  const cmsProxyTarget = env.PROXY_OPENEDX_CMS_URL || 'http://studio.192.168.0.226.nip.io';

  const allowedHosts = [
    'elearning.l-a.vn',
    'www.elearning.l-a.vn',
    '192.168.0.226',
    '192.168.0.226.nip.io',
    'studio.192.168.0.226.nip.io',
  ];

  // Proxy config dùng chung cho cả server (dev) và preview (prod)
  // Chỉ dùng khi truy cập trực tiếp qua IP, KHÔNG cần khi qua Kong
  const proxyConfig = {
    '/oauth2': {
      target: lmsProxyTarget,
      changeOrigin: true,
      cookieDomainRewrite: '',
    },
    '/cms-api': {
      target: cmsProxyTarget,
      changeOrigin: true,
      cookieDomainRewrite: '',
      rewrite: (path: string) => path.replace(/^\/cms-api/, ''),
    },
    '/api': {
      target: lmsProxyTarget,
      changeOrigin: true,
      cookieDomainRewrite: '',
    },
    '/login_ajax': {
      target: lmsProxyTarget,
      changeOrigin: true,
      cookieDomainRewrite: '',
    },
    '/logout': {
      target: lmsProxyTarget,
      changeOrigin: true,
      cookieDomainRewrite: '',
    },
    '/asset-v1:': { target: lmsProxyTarget, changeOrigin: true },
    '/c4x/':      { target: lmsProxyTarget, changeOrigin: true },
    '/static':    { target: lmsProxyTarget, changeOrigin: true },
    '/media':     { target: lmsProxyTarget, changeOrigin: true },
  };

  return {
    // base: '/admin/' — bắt buộc để assets và route hoạt động đúng qua Kong subpath
    base: '/admin/',

    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // ── Dev server (npm run dev) ──────────────────────────────────
    server: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: false,
      allowedHosts,
      proxy: proxyConfig,
    },

    // ── Production build ──────────────────────────────────────────
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            ui: ['framer-motion', 'recharts', 'sonner'],
          },
        },
      },
    },

    // ── Preview server (npm run preview / PM2 production) ─────────
    // Chạy port 5174 khớp với PM2 config trên production server
    // Khi truy cập qua Kong (https://elearning.l-a.vn/admin/):
    //   Kong forward /admin/* → port 5174, /api/* → LMS, /oauth2/* → LMS
    //   → proxy bên dưới KHÔNG được gọi (Kong đã lo)
    // Khi truy cập trực tiếp (http://192.168.0.226:5174/admin/):
    //   → proxy bên dưới forward API calls về LMS nội bộ
    preview: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      allowedHosts,
      proxy: proxyConfig,
    },
  };
});
