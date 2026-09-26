import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    env: {
      LANCEDB_PATH: './data/test-lancedb-run',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/cli/**',
        'src/index.ts',
        'src/lib.ts',
        'src/server.ts',
        'src/schema/types.ts',
      ],
    },
  },
});
