import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/tools/**/*.ts',
        'src/utils/**/*.ts',
        'src/vision/**/*.ts',
        'src/config.ts',
        'src/logger.ts',
      ],
      exclude: ['src/cli/**/*.ts', 'src/cli.ts'],
    },
  },
});
