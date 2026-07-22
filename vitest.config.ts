import { defineConfig } from 'vitest/config';

/**
 * Vitest 配置：核心模块单测，CI 不触外网。
 * collector 解析逻辑使用本地 fixtures（server/__tests__/fixtures）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    globals: false,
    testTimeout: 20000,
    pool: 'forks',
  },
});
