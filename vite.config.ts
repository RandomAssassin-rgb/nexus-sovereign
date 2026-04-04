import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
  const enableBasicSsl =
    env.VITE_DISABLE_BASIC_SSL !== '1' &&
    process.env.VITE_DISABLE_BASIC_SSL !== '1';

  return {
    plugins: [
      react(), 
      tailwindcss(),
      ...(enableBasicSsl ? [basicSsl()] : []),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true,
      proxy: {
        '/api': {
          // `vercel dev` serves locally over HTTP on port 3000 by default.
          // Override this when testing against the custom HTTPS Express server.
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
