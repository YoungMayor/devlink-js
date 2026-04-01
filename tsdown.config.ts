import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/devlink.ts'],
  format: 'cjs',
  outDir: 'dist',
  clean: true,
  dts: true,
});
