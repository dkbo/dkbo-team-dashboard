// 回歸：index.test.ts 的 samples 目錄會「先建出來、檔案晚一點才寫」，等檔不能把空陣列當成已到。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tmp, waitForFiles } from './helpers.ts';

describe('waitForFiles', () => {
  it('目錄已存在但還是空的時繼續等，直到出現檔案才返回', async () => {
    const dir = join(tmp(), 'samples');
    mkdirSync(dir);
    setTimeout(() => writeFileSync(join(dir, '2026-01-01.jsonl'), '{}\n'), 150);
    const t0 = Date.now();
    const files = await waitForFiles(dir, 2000);
    expect(files).toEqual(['2026-01-01.jsonl']);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100);
  });

  it('目錄還不存在時也等', async () => {
    const dir = join(tmp(), 'later');
    setTimeout(() => {
      mkdirSync(dir);
      writeFileSync(join(dir, 'a'), 'x');
    }, 100);
    expect(await waitForFiles(dir, 2000)).toEqual(['a']);
  });
});
