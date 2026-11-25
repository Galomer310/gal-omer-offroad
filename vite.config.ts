import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// Rapier ships its physics engine as a real .wasm file (not base64 inside the
// JavaScript), so the browser downloads it compressed and compiles it while it
// streams in. The plugin wires that file into the module graph.
export default defineConfig({
  plugins: [wasm()],
  build: {
    // The wasm glue uses top-level await; every browser with WebGL2 has it.
    target: 'es2022',
    // three.js and the game together are larger than Vite's default warning
    // threshold; that is expected for a 3D site and they load after the
    // loading screen is already showing.
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    // Pre-bundling would inline the wasm again in development.
    exclude: ['@dimforge/rapier3d'],
  },
});
