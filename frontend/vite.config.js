import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// https://vitejs.dev/config/
export default defineConfig({
  // Wails serves the built app from the embedded asset server, so every
  // Cesium asset URL has to be relative to the bundle root.
  base: './',
  plugins: [vue(), cesium()]
})
