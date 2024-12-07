import { defineConfig } from 'vite';

export default defineConfig({
    root: "src",
    base: "/modules/samioli-module/",
    build: {
      outDir: '../dist', 
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: 'hooks.ts',
        name: 'SamiOli Module',
        formats: ['es'] 
      }
    }
  });