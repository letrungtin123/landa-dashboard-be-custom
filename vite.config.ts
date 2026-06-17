import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // loadEnv với prefix '' để đọc được cả PROXY_* (không có prefix VITE_)
  // PROXY_* không bị bake vào browser bundle vì không có prefix VITE_
  const env = loadEnv(mode, process.cwd(), '');

  // Proxy targets — đọc từ env, fallback localhost
  const lmsProxyTarget = env.PROXY_OPENEDX_LMS_URL || 'http://localhost:18000';
  const cmsProxyTarget = env.PROXY_OPENEDX_CMS_URL || 'http://localhost:18010';

  const backendProxyTarget = env.PROXY_BACKEND_URL || 'http://localhost:3001';

  // Allowed hosts — đọc hoàn toàn từ env, phân cách bằng dấu phẩy
  const allowedHosts = env.VITE_ALLOWED_HOSTS
    ? env.VITE_ALLOWED_HOSTS.split(',').map((h: string) => h.trim()).filter(Boolean)
    : [];

  // Ports — đọc từ env
  const devPort = Number(env.VITE_DEV_PORT) || 8080;
  const previewPort = Number(env.VITE_PREVIEW_PORT) || 5274;

  // Proxy config dùng chung cho cả server (dev) và preview (prod)
  // Chỉ dùng khi truy cập trực tiếp qua IP, KHÔNG cần khi qua Kong
  const proxyConfig = {
    '/api': {
      target: backendProxyTarget,
      changeOrigin: true,
      cookieDomainRewrite: '',
    },
    '/uploads': {
      target: backendProxyTarget,
      changeOrigin: true,
    },
    // Vẫn giữ lại proxy cho các asset của edX cũ nếu frontend còn link cứng đến đó
    '/asset-v1:': { target: lmsProxyTarget, changeOrigin: true },
    '/c4x/':      { target: lmsProxyTarget, changeOrigin: true },
    '/static':    { target: lmsProxyTarget, changeOrigin: true },
    '/media':     { target: lmsProxyTarget, changeOrigin: true },
  };

  return {
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
      port: devPort,
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
    preview: {
      host: '0.0.0.0',
      port: previewPort,
      strictPort: true,
      allowedHosts,
      proxy: proxyConfig,
    },
  };
});

