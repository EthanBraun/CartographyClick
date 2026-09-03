import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset URLs, so the build works from any path: a local preview
  // server at the root, or GitHub Pages under a repository subpath.
  base: './',
  plugins: [vue(), cesium()],
  // Cesium's sources use BigInt literals, which the dependency pre-bundler's
  // default es2020 target rejects, so the dev server would refuse to start.
  optimizeDeps: {esbuildOptions: {target: 'esnext'}}
})
