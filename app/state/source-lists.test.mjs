import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {parseSourceList} = await import('./source-lists.js');
const {sha256} = await import('./sha256.js');

test('reads FPKGi lists', () => {
  const [entry] = parseSourceList({DATA: {'https://example.com/a.pkg': {name: 'A', size: 10, region: 'EUR', version: '1.00', min_fw: '9.00'}}});
  assert.deepEqual(entry, {url: 'https://example.com/a.pkg', name: 'A', sizeBytes: 10, region: 'EUR', version: '1.00', minFirmware: '9.00'});
});

test('reads Pegasus lists, one entry per link', () => {
  const entries = parseSourceList({name: 'P', packages: [{titleId: 'PPSA1', title: 'Game', version: '1.02', sizeBytes: 99, downloadLinks: [{name: 'Part 1', url: 'https://host.one/x'}, {name: 'Part 2', url: 'https://host.one/y'}]}, {title: 'Solo', sizeBytes: 5, downloadLinks: [{name: 'Mirror', url: 'https://host.two/z'}]}]});
  assert.deepEqual(entries.map((entry) => [entry.name, entry.url, entry.sizeBytes]), [
    ['Game – Part 1', 'https://host.one/x', null],
    ['Game – Part 2', 'https://host.one/y', null],
    ['Solo', 'https://host.two/z', 5]
  ]);
});

test('reads PS5 Library and homebrew.page lists', () => {
  const entries = parseSourceList({entries: [
    {title: 'App', size: 7, firmware: '10.01', files: [{url: 'https://a.example/app.pkg', name: 'app.pkg'}]},
    {title: 'Set', source_sets: [{host: 'filekeeper', files: [{url: 'https://b.example/1', name: 'p1', size: 3}, 'https://b.example/2']}]},
    {title: 'Bad', files: [{url: 'ftp://nope'}]}
  ]});
  assert.deepEqual(entries.map((entry) => [entry.name, entry.url, entry.sizeBytes, entry.minFirmware]), [
    ['App', 'https://a.example/app.pkg', 7, '10.01'],
    ['Set – p1', 'https://b.example/1', 3, null],
    ['Set – filekeeper', 'https://b.example/2', null, null]
  ]);
  assert.equal(parseSourceList({apps: [{name: 'X', download_url: 'https://c.example/x.elf'}]})[0].name, 'X');
});

test('refuses other shapes', () => {
  assert.throws(() => parseSourceList({hello: 1}), /FPKGi, Pegasus or PS5 Library/);
});

test('sha256 matches node', () => {
  for (const text of ['', 'abc', 'å'.repeat(100), 'x'.repeat(1000)]) assert.equal(sha256(text), createHash('sha256').update(text).digest('hex'));
});
