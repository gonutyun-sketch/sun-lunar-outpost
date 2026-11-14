import { defineConfig } from 'vite';

// `npm run analyze` — exact best-play search (~4 min, ~6 GB RAM). Not part of `npm test`.
export default defineConfig({ test: { environment: 'node', include: ['tools/**/*.test.ts'], testTimeout: 900000 } } as never);
