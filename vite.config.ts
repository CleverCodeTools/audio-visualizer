import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.CI ? '/audio-visualizer/' : '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
