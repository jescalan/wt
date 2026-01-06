import { describe, expect, test } from 'bun:test';
import { initCommand } from './init.js';
import { WtError } from '../core/errors.js';

describe('initCommand', () => {
  test('outputs zsh script', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      initCommand({ shell: 'zsh' });
      expect(logs.length).toBe(1);
      expect(logs[0]).toContain('wt()');
      expect(logs[0]).toContain('cd "$output"');
    } finally {
      console.log = originalLog;
    }
  });

  test('outputs bash script', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      initCommand({ shell: 'bash' });
      expect(logs.length).toBe(1);
      expect(logs[0]).toContain('wt()');
    } finally {
      console.log = originalLog;
    }
  });

  test('outputs fish script', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      initCommand({ shell: 'fish' });
      expect(logs.length).toBe(1);
      expect(logs[0]).toContain('function wt');
      expect(logs[0]).toContain('cd "$output"');
    } finally {
      console.log = originalLog;
    }
  });

  test('is case insensitive', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      initCommand({ shell: 'ZSH' });
      expect(logs[0]).toContain('wt()');
    } finally {
      console.log = originalLog;
    }
  });

  test('throws for unsupported shell', () => {
    expect(() => initCommand({ shell: 'powershell' })).toThrow(WtError);
  });
});
