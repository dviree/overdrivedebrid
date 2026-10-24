import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {createDownloadQueue} = await import('./download-queue.js');

const PS4_ID = 'UP0001-CUSA04013_00-TITANFALL2000000';
const PS4_HEAD = '\x7FCNT' + '\x00\x01\xff\xfe'.repeat(15) + PS4_ID + '\x00'.repeat(64);
const PS5_HEAD = '\x7FFIH' + '\x00'.repeat(120);
const RAR_HEAD = 'Rar!\x1a\x07\x01\x00' + '\x00'.repeat(120);

// The console's answer to a link: 'accepted' reports bytes, 'refused' fails, 'silent' says nothing.
function harness({head = PS4_HEAD, status = 206, console: answer = 'accepted', platform = 'ps5', format = 'binary', redirect = false} = {}) {
  const files = new Map();
  const dirs = new Set(['/data']);
  const requests = [], installs = [], enqueued = [];
  const fs = {
    exists: path => dirs.has(path) || files.has(path),
    stat: path => dirs.has(path) ? {isDirectory: true, device: 'dev', inode: 'root', modified: 0} :
      files.has(path) ? {isFile: true, size: 4096, modified: 0} : null,
    diskUsage: () => ({free: 1024 ** 4}),
    mkdir: path => { dirs.add(path); },
    writeFile: (path, data) => { files.set(path, data); },
    readFile: path => files.get(path) ?? '',
    rename: (source, target) => { if (files.has(source)) { files.set(target, files.get(source)); files.delete(source); } },
    readDir: () => [],
    remove: path => { files.delete(path); },
    removeAsync: async path => { files.delete(path); dirs.delete(path); },
  };
  const http = {
    async request(url, options) {
      requests.push({url, options});
      if (redirect && url === 'https://host.example/f/abc')
        return {status: 302, ok: false, headers: {location: 'https://cdn.example/file.pkg'}, text: async () => ''};
      return {status, ok: status < 300, headers: {}, text: async () => head};
    },
  };
  const downloads = {
    enqueue(options) {
      enqueued.push(options);
      files.set(options.destination, 'game bytes');
      return {done: Promise.resolve({written: 4096}), snapshot: {state: 'completed'}, subscribe: () => () => {}, cancel: () => {}};
    },
  };
  const packages = {
    install(request) {
      installs.push(request);
      const listeners = new Set();
      let finish, fail;
      const done = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
      done.catch(() => {});
      const task = {
        snapshot: {state: 'queued', written: 0},
        done,
        subscribe(listener) { listener(task.snapshot); listeners.add(listener); return () => listeners.delete(listener); },
        cancel() { fail(new Error('cancelled')); },
      };
      setTimeout(() => {
        if (answer === 'refused') return fail(new Error('Packages.install: The console refused the package. (0x80990085)'));
        task.snapshot = {state: 'installing', written: 0};
        if (answer === 'accepted') {
          task.snapshot = {state: 'installing', written: 1 << 20, total: 1 << 30};
          for (const listener of listeners) listener(task.snapshot);
        }
      }, 5);
      return task;
    },
  };
  const formats = {artifact: (release, where) => ({
    directory: where + '/downloads/files',
    destination: where + '/downloads/files/' + release.filename,
    nextAction: release.format === 'pkg' ? 'installer-required' : 'downloaded',
  })};
  const queue = createDownloadQueue({
    fs, http, downloads, packages, formats,
    dataDir: '/data', platform,
    archives: {streams: true, supportsAsyncInspection: false, inspect: () => ({kind: null})},
    notifications: {show() {}}, power: {keepAwake() {}},
    sources: {resolve: async entry => ({url: entry.url})},
  });
  const release = {id: 'source-1', filename: format === 'binary' ? 'game.binary' : 'game.' + format,
    url: redirect ? 'https://host.example/f/abc' : 'https://cdn.example/file.pkg', format, provider: 'vikingfile'};
  const id = queue.enqueue({id: 'CUSA04013', title: 'Titanfall 2'}, release, '/data');
  return {queue, id, requests, installs, enqueued};
}

async function settled(fixture, states = ['installed', 'file-downloaded', 'installer-required', 'failed', 'downloaded']) {
  for (const until = Date.now() + 10000; Date.now() < until;) {
    const job = fixture.queue.snapshot().find(item => item.id === fixture.id);
    if (states.includes(job?.state)) return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Queue did not settle');
}

test('a PS4 PKG link goes to the console with its content ID, and nothing downloads here', async () => {
  const fixture = harness();
  const job = await settled(fixture);
  assert.equal(job.state, 'installed', job.error);
  assert.equal(job.streamed, true);
  assert.deepEqual(fixture.installs, [{url: 'https://cdn.example/file.pkg', name: 'Titanfall 2', contentId: PS4_ID}]);
  assert.equal(fixture.enqueued.length, 0);
  assert.equal(fixture.requests[0].options.headers.Range, 'bytes=0-4095');
});

test('a PS5 PKG goes without a content ID, through the link a redirect names', async () => {
  const fixture = harness({head: PS5_HEAD, redirect: true});
  const job = await settled(fixture);
  assert.equal(job.state, 'installed', job.error);
  assert.deepEqual(fixture.installs.map(item => [item.url, item.contentId]), [['https://cdn.example/file.pkg', '']]);
});

test('an archive downloads here as before', async () => {
  const fixture = harness({head: RAR_HEAD});
  const job = await settled(fixture);
  assert.notEqual(job.state, 'installed');
  assert.equal(fixture.installs.length, 0);
  assert.equal(fixture.enqueued.length, 1);
});

test('a host that ignores ranges downloads here', async () => {
  const fixture = harness({status: 200});
  await settled(fixture);
  assert.equal(fixture.installs.length, 0);
  assert.equal(fixture.enqueued.length, 1);
});

test('a link the console refuses downloads here instead, and is not offered again', async () => {
  const fixture = harness({console: 'refused', format: 'pkg'});
  const job = await settled(fixture);
  assert.equal(fixture.installs.length, 2, 'the link, then the downloaded file');
  assert.equal(fixture.installs[1].path, '/data/downloads/files/game.pkg');
  assert.equal(fixture.enqueued.length, 1);
  assert.equal(job.streamTried, true);
  assert.equal(job.streamed, undefined);
});

test('a source of a declared archive format is never probed', async () => {
  const fixture = harness({format: 'rar', head: RAR_HEAD});
  await settled(fixture, ['file-downloaded', 'failed', 'extraction-required', 'extracted', 'downloaded']);
  assert.equal(fixture.requests.length, 0);
});

test('outside the PS5 nothing is probed', async () => {
  const fixture = harness({platform: 'desktop'});
  await settled(fixture);
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.installs.length, 0);
});
