import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Polyfill ALL Node builtins — Web3Auth needs many
      globals: { Buffer: true, global: true, process: false },
      protocolImports: true,
      overrides: {
        // Must use our own CJS-compatible process shim.
        // The plugin's built-in shim wraps process in ESM named exports,
        // which breaks CJS consumers like readable-stream that do:
        //   var process2 = require("process")  // gets { default, process } not the actual obj
        process: path.resolve(__dirname, 'src/process-shim.js'),
      },
    }),
  ],
  // Some Web3Auth/CJS deps reference `module` which doesn't exist in the browser
  define: {
    'module': '({})',
  },
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    // Force Vite to re-bundle deps with the correct process shim
    force: true,
  },
})
