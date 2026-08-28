import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  root: command === 'serve' ? 'playground' : process.cwd(),
  resolve: {
    alias: {
      '@guillemservera/vue-sortable': resolve(__dirname, 'src/index.ts'),
    },
  },
  plugins: [
    vue(),
    dts({
      entryRoot: 'src',
      include: ['src'],
      exclude: ['tests', 'playground'],
      rollupTypes: true,
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  build: {
    minify: 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'index',
      formats: ['es'],
    },
    reportCompressedSize: true,
    rollupOptions: {
      external: ['vue'],
      output: {
        compact: true,
      },
    },
  },
}))
