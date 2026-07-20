import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the frontend's pure logic (curriculum, humanize, topology
// health, etc.). Node environment — these modules have no DOM dependency;
// component/DOM tests (jsdom + Testing Library) can be layered on later.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
