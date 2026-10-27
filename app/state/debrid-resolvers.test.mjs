import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {createTorboxResolver} = await import('./torbox.js');
const {createPremiumizeResolver} = await import('./premiumize.js');

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
  const {createRealDebridResolver} = await import('./realdebrid.js');
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

const reply = (status, body, headers = {}) => ({status, ok: status < 300, headers, text: async () => JSON.stringify(body), json: async () => body});

test('TorBox in the chain: waits out a 429, reuses a link it holds, and hands back its CDN link', async () => {
  const {createTorboxResolver} = await import('./torbox.js');
  const calls = [];
  let throttled = false;
  const http = {request: async (url, options) => {
    calls.push([options.method || 'GET', url.replace('https://api.torbox.app', '')]);
    if (/webdl\/mylist\?bypass_cache=true$/.test(url)) {
      if (!throttled) { throttled = true; return reply(429, {}, {'retry-after': '1'}); }
      return reply(200, {success: true, data: [{id: 5, original_url: 'https://1fichier.com/?abc', download_state: 'cached'}]});
    }
    if (/webdl\/mylist\?id=5$/.test(url)) return reply(200, {success: true, data: {id: 5, download_finished: true, files: [{id: 1, size: 10}, {id: 2, size: 99}]}});
    if (/webdl\/requestdl\?/.test(url)) return reply(200, {success: true, data: 'https://cdn.tb-cdn.st/dld/x'});
    throw new Error('unexpected ' + url);
  }};
  const waits = [];
  const resolver = createTorboxResolver({http, apiKey: () => 'k', wait: async (ms) => waits.push(ms), fallback: {resolve: async () => ({url: 'next'})}});
  assert.deepEqual(await resolver.resolve({url: 'https://1fichier.com/?abc'}), {url: 'https://cdn.tb-cdn.st/dld/x', rejectHtml: true, expectedBytes: 99});
  assert.deepEqual(waits, [1000]);
  assert.ok(!calls.some(([, url]) => url.includes('createwebdownload')), 'a held link is not added again');
  assert.match(calls.at(-1)[1], /web_id=5&file_id=2$/);
});

test('TorBox declining a link lets the next service try; a refused key fails', async () => {
  const {createTorboxResolver} = await import('./torbox.js');
  const declined = {request: async (url) => /mylist/.test(url) ? reply(200, {success: true, data: []}) : reply(200, {success: false, error: 'UNSUPPORTED_SITE', detail: 'The site is not supported.'})};
  const next = {resolve: async () => ({url: 'next'})};
  assert.deepEqual(await createTorboxResolver({http: declined, apiKey: () => 'k', fallback: next}).resolve({url: 'https://odd.example/f'}), {url: 'next'});
  const refused = {request: async () => reply(401, {detail: 'Unauthorized'})};
  await assert.rejects(createTorboxResolver({http: refused, apiKey: () => 'k', fallback: next}).resolve({url: 'https://odd.example/f'}), /rejected the API key/);
});

test('Premiumize in the chain: a held file at once, the key as apikey, the next service for the rest', async () => {
  const {createPremiumizeResolver} = await import('./premiumize.js');
  const seen = [];
  const http = {request: async (url, options) => {
    seen.push(options.body);
    return reply(200, {status: 'success', content: [{path: 'g/game.rar', size: 77, link: 'https://storage.premiumize.me/g/game.rar'}]});
  }};
  const next = {resolve: async () => ({url: 'next'})};
  assert.deepEqual(await createPremiumizeResolver({http, apiKey: () => 'PK', fallback: next}).resolve({url: 'https://rapidgator.net/file/1'}), {url: 'https://storage.premiumize.me/g/game.rar', rejectHtml: true, expectedBytes: 77});
  assert.equal(new URLSearchParams(seen[0]).get('apikey'), 'PK');
  const unsupported = {request: async () => reply(200, {status: 'error', message: 'This file is not supported.'})};
  assert.deepEqual(await createPremiumizeResolver({http: unsupported, apiKey: () => 'PK', fallback: next}).resolve({url: 'https://odd.example/f'}), {url: 'next'});
  const refused = {request: async () => reply(401, {status: 'error', message: 'Authentication failed.'})};
  await assert.rejects(createPremiumizeResolver({http: refused, apiKey: () => 'PK', fallback: next}).resolve({url: 'https://odd.example/f'}), /rejected the API key/);
});

test('the TorBox account lists ready files and adds a link with the shared client', async () => {
  const {createTorboxAccount} = await import('./torbox.js');
  const posted = [];
  const http = {request: async (url, options) => {
    if (options.method === 'POST') { posted.push([url, options.body]); return reply(200, {success: true, data: {webdownload_id: 3}}); }
    if (/torrents\/mylist/.test(url)) return reply(200, {success: true, data: [{id: 1, name: 'Game', download_finished: true, created_at: '2026-10-01', files: [{id: 4, short_name: 'game.pkg', size: 5}]}]});
    return reply(200, {success: true, data: []});
  }};
  const account = createTorboxAccount({http, apiKey: () => 'k'});
  const [entry] = await account.list();
  assert.equal(entry.name, 'game.pkg');
  assert.equal(entry.ready, true);
  assert.equal(account.release(entry).torbox.file, 4);
  await account.add('https://1fichier.com/?x');
  assert.match(posted[0][0], /webdl\/createwebdownload$/);
  assert.equal(new URLSearchParams(posted[0][1]).get('link'), 'https://1fichier.com/?x');
});
