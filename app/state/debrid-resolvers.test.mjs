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
