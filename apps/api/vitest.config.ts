import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one SQLite file (test.db) and reset its schema.
    fileParallelism: false,
    include: ['test/**/*.test.ts']
  }
});
