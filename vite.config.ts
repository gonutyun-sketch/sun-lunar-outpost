import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the static build deployable to any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Unit tests only; the slow exact balance search runs via `npm run analyze` (tools/).
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
