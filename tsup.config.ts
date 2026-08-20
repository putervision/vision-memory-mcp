import { defineConfig } from 'tsup';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: false,
  minify: false,
  splitting: false,
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
