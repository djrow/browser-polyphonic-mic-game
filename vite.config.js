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
      name: 'serve-ort-wasm-plugin',
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
      closeBundle() {
        // Copy WASM and MJS files to dist/ort-wasm for static deployment (Netlify/Cloudflare)
        const destDir = path.resolve('dist/ort-wasm');
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const srcDir = path.resolve('node_modules/onnxruntime-web/dist');
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
          if (file.endsWith('.wasm') || file.endsWith('.mjs')) {
            fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
          }
        }
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
