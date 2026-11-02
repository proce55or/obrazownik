import { expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { resolveDataDir } from '../../src/server/paths.js';
test('data path is independent of cwd and rejects repo nesting, relative paths and symlinks', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'obrazownik-path-'));
  try {
    const root = path.join(dir, 'repo'); mkdirSync(root);
    expect(resolveDataDir(undefined, root)).toBe(path.join(homedir(), 'Obrazownik-dane'));
    expect(() => resolveDataDir('relative', root)).toThrow();
    expect(() => resolveDataDir(root, root)).toThrow();
    expect(() => resolveDataDir(path.join(root, 'nested/missing'), root)).toThrow();
    const link = path.join(dir, 'link'); symlinkSync(root, link);
    expect(() => resolveDataDir(path.join(link, 'nested'), root)).toThrow();
    expect(resolveDataDir(path.join(dir, 'safe space'), root)).toBe(path.join(realpathSync(dir), 'safe space'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
