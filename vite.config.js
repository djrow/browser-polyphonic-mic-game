import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    {
      name: 'serve-ort-wasm-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/ort-wasm/')) {
            const fileName = req.url.replace('/ort-wasm/', '').split('?')[0];
            const filePath = path.resolve('node_modules/onnxruntime-web/dist', fileName);
            if (fs.existsSync(filePath)) {
              if (fileName.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
              } else if (fileName.endsWith('.mjs') || fileName.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
              }
              res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
              res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
              return fs.createReadStream(filePath).pipe(res);
            }
          }
          next();
        });
      },
    },
  ],
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  test: {
    globals: true,
    environment: 'node',
  },
});
