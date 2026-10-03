  import { defineConfig } from 'vite';
  import { resolve } from 'path';

  export default defineConfig({
    root: 'frontend',
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': 'http://127.0.0.1:3000'
      }
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'frontend/index.html'),
          login: resolve(__dirname, 'frontend/login.html'),
          signup: resolve(__dirname, 'frontend/signup.html'),
          contacts: resolve(__dirname, 'frontend/contacts.html')
        }
      }
    }
  });
