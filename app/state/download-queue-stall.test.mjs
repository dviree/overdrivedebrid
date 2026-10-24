import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {createDownloadQueue} = await import('./download-queue.js');

// Issue #77: DataNodes and FileKeeper's dlproxy.uk gateway answers range after range with HTTP 503
// while it wants a pause. The download then sits at 0 MB/s, and only Pause and Resume brought it
// back; the app restarts such a transfer by itself once nothing has been received for the stall
// time. A retried range drops `received` back, so only a new high counts as progress — otherwise
// every retry reset the wait and the restart never came (Narci115's app.log).
const ROOT = '/data';
const DESTINATION = ROOT + '/downloads/packages/game.pkg';

function console_() {
  const files = new Map();
  const dirs = new Set([ROOT, ROOT + '/downloads', ROOT + '/downloads/packages']);
  const fs = {
    exists: path => dirs.has(path) || files.has(path),
    stat: path => dirs.has(path) ? {isDirectory: true, device: 'dev1', inode: 'root', modified: 0} :
      files.has(path) ? {isFile: true, size: String(files.get(path)).length, modified: 0} : null,
    diskUsage: () => ({free: 1024 ** 4}),
    mkdir: path => { dirs.add(path); },
    writeFile: (path, data) => { files.set(path, data); },
    readFile: path => files.get(path) ?? '',
    rename: (source, target) => { if (files.has(source)) { files.set(target, files.get(source)); files.delete(source); } },
    readDir: () => [],
    remove: path => { files.delete(path); },
    removeAsync: async path => { files.delete(path); dirs.delete(path); },
  };
  return {files, dirs, fs};
}

function transfer(start) {
  let settle, refuse;
  const done = new Promise((resolve, reject) => { settle = resolve; refuse = reject; });
  let timer = null;
  const task = {
    done,
    snapshot: {state: 'downloading'},
    subscribe(listener) {
      timer = start(listener, () => { clearInterval(timer); settle({written: 1000}); });
      return () => { clearInterval(timer); };
    },
    cancel() { clearInterval(timer); refuse(new Error('download cancelled by the test')); },
  };
  return task;
}

function boot(machine, enqueue, {stallMs = 120} = {}) {
  const formats = {artifact: (release, where) => ({
    directory: where + '/downloads/packages',
    destination: where + '/downloads/packages/' + release.filename,
    nextAction: 'installer-required',
  })};
  return createDownloadQueue({
    fs: machine.fs, downloads: {enqueue}, formats, dataDir: ROOT, platform: 'desktop', stallMs,
    notifications: {show() {}}, power: {keepAwake() {}},
    sources: {resolve: async () => ({url: 'https://tunnel1.dlproxy.uk/file'})},
  });
}

const release = url => ({id: 'source-1', filename: 'game.pkg', url, format: 'pkg', sizeBytes: 1000});
const game = {id: 'CUSA00001', title: 'Demo'};

async function settled(queue, id, states, until = 4000) {
  for (const end = Date.now() + until; Date.now() < end;) {
    const job = queue.snapshot().find(item => item.id === id);
    if (states.includes(job?.state)) return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Queue did not settle: ' + JSON.stringify(queue.snapshot().find(item => item.id === id)));
}

test('a gateway that only retries ranges is restarted instead of sitting at 0 MB/s', async () => {
  const machine = console_();
  let transfers = 0;
  const enqueue = () => transfer((emit, finish) => {
    if (++transfers === 1) {
      // A 503 for every range: `received` falls back to 0 and climbs to 100 again, never further.
      return setInterval(() => emit({state: 'downloading', received: Date.now() % 2 ? 100 : 0, completedBytes: 0, total: 1000}), 5).unref();
    }
    let received = 0;
    return setInterval(() => {
      received += 100;
      if (received >= 1000) finish();
      else emit({state: 'downloading', received, completedBytes: 0, total: 1000});
    }, 5).unref();
  });
  const queue = boot(machine, enqueue);
  const id = queue.enqueue(game, release('https://filekeeper.net/file/abc'), ROOT);
  const job = await settled(queue, id, ['installer-required', 'failed']);
  assert.equal(job.state, 'installer-required', job.error);
  assert.equal(transfers, 2);
});

test('a transfer that keeps receiving is never restarted', async () => {
  const machine = console_();
  let transfers = 0;
  const enqueue = () => transfer((emit, finish) => {
    transfers++;
    let received = 0;
    return setInterval(() => {
      received += 100;
      if (received >= 1000) finish();
      else emit({state: 'downloading', received, completedBytes: 0, total: 1000});
    }, 10).unref();
  });
  const queue = boot(machine, enqueue, {stallMs: 120});
  const id = queue.enqueue(game, release('https://filekeeper.net/file/abc'), ROOT);
  const job = await settled(queue, id, ['installer-required', 'failed']);
  assert.equal(job.state, 'installer-required', job.error);
  assert.equal(transfers, 1);
});

test('a source that is not the gateway waits out a quiet patch', async () => {
  const machine = console_();
  let transfers = 0;
  const enqueue = () => {
    transfers++;
    return transfer(() => setInterval(() => {}, 1000).unref());
  };
  const queue = boot(machine, enqueue, {stallMs: 60});
  const id = queue.enqueue(game, release('https://archive.org/download/x/game.pkg'), ROOT);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(transfers, 1);
  assert.notEqual(queue.snapshot().find(item => item.id === id).state, 'failed');
  queue.pause(id);
});
