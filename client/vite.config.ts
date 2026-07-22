import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 配置（客户端）。
 * - 开发期：dev server 在 5173，将 /api 代理到后端 3000。
 * - 生产构建：输出到 client/dist，由后端 server 在 / 托管。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
