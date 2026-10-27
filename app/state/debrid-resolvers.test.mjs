import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {createTorboxResolver} = await import('./debrid-torbox.js');
const {createPremiumizeResolver} = await import('./debrid-premiumize.js');

const release = {url: 'https://unlisted.example/file', provider: 'unlisted.example'};
const host = {resolve: async () => ({url: 'host'})};
const refusing = {request: async () => { throw new Error('no debrid call expected'); }};

test('a host a list leaves out, or Download directly, goes straight to the host', async () => {
  const premiumize = createPremiumizeResolver({http: refusing, apiKey: () => 'key', supports: () => false, fallback: host});
  const torbox = createTorboxResolver({http: refusing, apiKey: () => 'key', supports: () => false, fallback: premiumize});
  assert.deepEqual(await torbox.resolve(release), {url: 'host'});
  const open = createTorboxResolver({http: refusing, apiKey: () => 'key', fallback: createPremiumizeResolver({http: refusing, apiKey: () => 'key', fallback: host})});
  assert.deepEqual(await open.resolve(release, {noDebrid: true}), {url: 'host'});
});

test('Real-Debrid unrestricts a host link, passes on what it refuses, and fails on a bad token', async () => {
  const {createRealDebridResolver} = await import('./debrid-realdebrid.js');
  const host = {resolve: async () => ({url: 'host'})};
  const answer = (status, body) => ({status, ok: status < 300, text: async () => JSON.stringify(body)});
  const seen = [];
  const http = {request: async (url, options) => {
    seen.push([url, options.headers.Authorization, options.body]);
    return answer(200, {download: 'https://node.real-debrid.com/d/ABC/game.rar', filename: 'game.rar', filesize: 42});
  }};
  const resolver = createRealDebridResolver({http, apiKey: () => 'TOKEN', fallback: host});
  assert.deepEqual(await resolver.resolve({url: 'https://1fichier.com/?abc'}), {url: 'https://node.real-debrid.com/d/ABC/game.rar', rejectHtml: true, expectedBytes: 42});
  assert.deepEqual(seen[0], ['https://api.real-debrid.com/rest/1.0/unrestrict/link', 'Bearer TOKEN', `link=${encodeURIComponent('https://1fichier.com/?abc')}`]);
  const unsupported = createRealDebridResolver({http: {request: async () => answer(503, {error: 'hoster_unsupported', error_code: 16})}, apiKey: () => 'TOKEN', fallback: host});
  assert.deepEqual(await unsupported.resolve({url: 'https://odd.example/x'}), {url: 'host'});
  const badToken = createRealDebridResolver({http: {request: async () => answer(401, {error: 'bad_token', error_code: 8})}, apiKey: () => 'TOKEN', fallback: host});
  await assert.rejects(badToken.resolve({url: 'https://1fichier.com/?abc'}), /rejected the token/);
  assert.deepEqual(await resolver.resolve({url: 'https://1fichier.com/?abc'}, {noDebrid: true}), {url: 'host'});
});
