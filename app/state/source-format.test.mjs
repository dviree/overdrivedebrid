import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {formatName} = await import('./source-format.js');

// dviree/overdrivedebrid: most catalog sources are "binary" (known only once downloaded), so the
// source list named no format for them; their own label, file name or link usually says it.
test('the format is named, from the source itself when it is listed as binary', () => {
  assert.equal(formatName({format: 'exfat', label: 'USA'}), 'exFAT');
  assert.equal(formatName({format: 'pkg'}), 'PKG');
  assert.equal(formatName({format: 'binary', label: 'Fpkg - DataNodes'}), 'FPKG');
  assert.equal(formatName({format: 'binary', label: 'EUR 9.xx Base - 1fichier', filename: 'x.binary', url: 'https://host/Game.exfat'}), 'exFAT');
  assert.equal(formatName({format: 'binary', label: 'Backport', url: 'https://host/file.rar'}), 'RAR');
  assert.equal(formatName({format: 'binary', label: 'USA 7.xx', url: 'https://1fichier.com/?abc'}), null);
  assert.equal(formatName({format: 'binary', label: 'Packages'}), null, 'a word that merely contains pkg-like letters is not a format');
  assert.equal(formatName({format: 'archive-set', parts: [{sources: [{format: 'binary', url: 'https://h/g.part1.rar'}]}]}), 'RAR');
});

test('across the catalog, far more sources now say their format', () => {
  const dir = new URL('../data/releases/', import.meta.url);
  let total = 0, named = 0, listed = 0;
  for (const file of readdirSync(dir)) {
    for (const release of JSON.parse(readFileSync(new URL(file, dir), 'utf8'))) {
      total++;
      if (release.format !== 'binary') listed++;
      if (formatName(release)) named++;
    }
  }
  console.log(`formats: ${named} of ${total} sources named (${listed} had a format of their own)`);
  assert.ok(named > listed);
});
