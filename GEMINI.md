# Engineering Guidelines: Vite, WebAssembly (ONNX Runtime Web), and AudioWorklet Deployment

## 1. Vite & WebAssembly / ONNX Runtime Asset Rules
- **Never place `.mjs` or dynamic JavaScript modules in the `/public` directory**: Vite prohibits dynamic `import()` of files located inside `/public`.
- **Serving WASM & MJS Runtime Dependencies**:
  - In development: Configure Vite dev server middleware in `vite.config.js` to stream `.wasm` and `.mjs` binaries directly from `node_modules/onnxruntime-web/dist` with `application/wasm` and `application/javascript` content types.
  - In production build: Use Vite's `closeBundle()` hook to copy required runtime assets into `dist/ort-wasm/`.
- **Worker Loading Resilience**:
  - When initializing `ort.env.wasm.wasmPaths`, target the local route first (`/ort-wasm/`), with a version-pinned CDN fallback (`https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/`).
  - Always fetch `.onnx` models into an `ArrayBuffer` before instantiating `ort.InferenceSession.create(arrayBuffer)` to bypass worker URL path resolution discrepancies.

## 2. Cross-Origin Isolation for Web Audio & WASM SIMD
- High-performance audio processing with `AudioWorkletProcessor` and threaded WASM requires Cross-Origin Isolation.
- Every deployment target must specify:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- For Netlify: maintain `netlify.toml` and `public/_headers` specifying these headers for `/*` and explicit `application/wasm` MIME types for `/*.wasm`.

## 3. GitHub & Deployment Workflows
- When creating repositories in environments without pre-existing tokens, use `gh auth login --web` to leverage the one-time OAuth device code flow.
