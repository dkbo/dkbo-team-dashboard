import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    },
  }),
)
