import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the static build deployable to any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
} as never);
