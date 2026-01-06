import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI entry point
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    clean: true,
    splitting: false,
    sourcemap: true,
    dts: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Plugins (no shebang)
  {
    entry: {
      'plugins/neon': 'src/plugins/neon.ts',
      'plugins/codex': 'src/plugins/codex.ts',
      'plugins/claude': 'src/plugins/claude.ts',
      'plugins/planetscale': 'src/plugins/planetscale.ts',
    },
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    clean: false, // Don't clean, index.ts build already did
    splitting: false,
    sourcemap: true,
    dts: true,
  },
  // Types export
  {
    entry: {
      'types': 'src/plugins/types.ts',
    },
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    clean: false,
    splitting: false,
    sourcemap: true,
    dts: true,
  },
]);
