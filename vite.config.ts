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
    'cms.nesso.vn',
    'localhost',
    '127.0.0.1',
    '192.168.47.19',
    // Đọc thêm từ env nếu có
    ...(env.VITE_ALLOWED_HOSTS
      ? env.VITE_ALLOWED_HOSTS.split(',').map((h: string) => h.trim()).filter(Boolean)
      : []),
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

    // ── Production build — giảm request cho Tunnelto ──
    build: {
      sourcemap: false,
      assetsInlineLimit: 200 * 1024,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          // Vite 8 / Rolldown: manualChunks phải là function
          manualChunks(id: string) {
            if (id.includes('node_modules/react-dom') ||
                id.includes('node_modules/react/') ||
                id.includes('node_modules/react-router') ||
                id.includes('node_modules/@tanstack/react-query')) {
              return 'vendor';
            }
            if (id.includes('node_modules/framer-motion') ||
                id.includes('node_modules/recharts') ||
                id.includes('node_modules/sonner')) {
              return 'ui';
            }
          },
        },
      },
    },

    // ── Preview server (npm run preview / PM2 production) ─────────
    // Chạy port 5274 — LAN access: http://192.168.47.19:5274/admin/
    preview: {
      host: '0.0.0.0',
      port: 5274,
      strictPort: true,
      allowedHosts,
      proxy: proxyConfig,
    },
  };
});
