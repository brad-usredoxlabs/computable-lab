/**
 * TEMPORARY isolated Vite config for live inspection. NOT committed.
 * Serves on 5192 proxying /api to the isolated backend on 3991. Based on the
 * real config with only port+proxy overridden.
 */
import config from './vite.config'

const base = (config as { default?: unknown }).default ?? config
const options = (base as { server?: unknown }).server ?? {}

export default {
  ...(base as object),
  server: {
    ...(options as object),
    host: '127.0.0.1',
    port: 5192,
    watch: { ignored: ['!**/node_modules/**'] },
    proxy: {
      '/api': { target: 'http://localhost:3991', changeOrigin: true },
    },
  },
}