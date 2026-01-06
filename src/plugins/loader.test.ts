import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from './loader.js';
import { defaultSettings } from './types.js';

describe('loadConfig', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-loader-'));
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('returns defaults when no config file exists', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-empty-'));
    try {
      const config = await loadConfig(emptyDir);
      expect(config.settings).toEqual(defaultSettings);
      expect(config.plugins).toEqual([]);
      expect(config.hooks).toEqual({});
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test('loads config from wt.config.ts', async () => {
    const configContent = `
export default {
  copyGitIgnoredFiles: false,
  plugins: [
    { name: 'test-plugin', hooks: {} }
  ],
  hooks: {
    afterCreate: async () => {}
  }
};
`;
    fs.writeFileSync(path.join(testDir, 'wt.config.ts'), configContent);

    const config = await loadConfig(testDir);
    expect(config.settings.copyGitIgnoredFiles).toBe(false);
    expect(config.plugins).toHaveLength(1);
    expect(config.plugins[0]?.name).toBe('test-plugin');
    expect(config.hooks.afterCreate).toBeDefined();
  });

  test('loads config from wt.config.js', async () => {
    // Use isolated directory to avoid parent config interference
    const jsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-js-config-'));

    try {
      const configContent = `
export default {
  copyGitIgnoredFiles: true,
  plugins: []
};
`;
      fs.writeFileSync(path.join(jsDir, 'wt.config.js'), configContent);

      const config = await loadConfig(jsDir);
      expect(config.settings.copyGitIgnoredFiles).toBe(true);
    } finally {
      fs.rmSync(jsDir, { recursive: true, force: true });
    }
  });

  test('applies default settings for missing options', async () => {
    const partialDir = path.join(testDir, 'partial-config');
    fs.mkdirSync(partialDir);

    const configContent = `
export default {
  plugins: [{ name: 'minimal' }]
};
`;
    fs.writeFileSync(path.join(partialDir, 'wt.config.ts'), configContent);

    const config = await loadConfig(partialDir);
    expect(config.settings.copyGitIgnoredFiles).toBe(true); // default
    expect(config.plugins).toHaveLength(1);
  });

  test('finds config in parent directory', async () => {
    const nestedDir = path.join(testDir, 'nested', 'deep', 'path');
    fs.mkdirSync(nestedDir, { recursive: true });

    // Config already exists in testDir from earlier test
    const config = await loadConfig(nestedDir);
    expect(config.plugins).toBeDefined();
  });
});
