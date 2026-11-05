/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  plugins: [command === 'build' && react(), tailwindcss()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts?(x)'],
  },
}));
