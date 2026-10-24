import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';

register(new URL('./download-queue-test-loader.mjs', import.meta.url), import.meta.url);
const {createCaptchaResolver, digitCaptcha, widget, xfsForm} = await import('./captcha.js');
const {BrowserRequired} = await import('./download-sources.js');

const page1 = `<form method="POST" action=""><input type="hidden" name="op" value="download1"><input type="hidden" name="id" value="abc123def456"><input type="submit" name="method_free" value="Free Download"><input type="submit" name="method_premium" value="Premium"></form>`;
const page2 = `<span id="countdown"><span class="seconds">0</span></span><form name="F1" method="POST" action="https://vault.example/abc123def456"><input type="hidden" name="op" value="download2"><input type="hidden" name="id" value="abc123def456"><input type="hidden" name="rand" value="r4nd"><div class="g-recaptcha" data-sitekey="SITEKEY-1"></div><input type="checkbox" name="adblock"><button>Go</button></form>`;

test('reads XFileSharing forms, digit captchas and widgets', () => {
  assert.deepEqual(xfsForm(page1, 'https://vault.example/abc123def456').fields, {op: 'download1', id: 'abc123def456', method_free: 'Free Download'});
  const second = xfsForm(page2, 'https://vault.example/x');
  assert.equal(second.target, 'https://vault.example/abc123def456');
  assert.deepEqual(second.fields, {op: 'download2', id: 'abc123def456', rand: 'r4nd'});
  assert.deepEqual(widget(page2), {type: 'RecaptchaV2TaskProxyless', field: 'g-recaptcha-response', key: 'SITEKEY-1'});
  assert.deepEqual(widget('<div data-sitekey="0x4AAA" class="cf-turnstile"></div>'), {type: 'TurnstileTaskProxyless', field: 'cf-turnstile-response', key: '0x4AAA'});
  const digits = '<td align=right><div style="width:80px;height:26px;font:bold 13px Arial;background:#ccc;text-align:left;direction:ltr;"><span style="position:absolute;padding-left:46px;padding-top:4px;">&#55;</span><span style="position:absolute;padding-left:10px;padding-top:6px;">&#49;</span><span style="position:absolute;padding-left:28px;padding-top:3px;">&#57;</span><span style="position:absolute;padding-left:64px;padding-top:5px;">&#50;</span></div></td>';
  assert.equal(digitCaptcha(digits), '1972');
});

test('passes a captcha page with 2Captcha after the host asks for a browser', async () => {
  const posts = [];
  const http = {async request(url, options = {}) {
    const respond = (status, body = '', headers = {}) => ({ok: status < 300, status, url, headers, text: async () => body, json: async () => JSON.parse(body)});
    if (url.startsWith('https://api.2captcha.com/createTask')) return respond(200, JSON.stringify({errorId: 0, taskId: 7}));
    if (url.startsWith('https://api.2captcha.com/getTaskResult')) return respond(200, JSON.stringify({errorId: 0, status: 'ready', solution: {gRecaptchaResponse: 'TOKEN'}}));
    if (options.method === 'HEAD') return respond(200, '', {'content-type': 'application/octet-stream', 'content-length': '1234'});
    if (options.method === 'POST') {
      posts.push(Object.fromEntries(new URLSearchParams(options.body)));
      return posts.length === 1 ? respond(200, page2) : respond(302, '', {location: 'https://cdn.vault.example/files/game.pkg'});
    }
    return respond(200, page1);
  }};
  const fallback = {resolve: async (release) => { throw new BrowserRequired(release.url); }};
  const resolver = createCaptchaResolver({http, apiKey: () => 'k'.repeat(32), fallback});
  const timers = [];
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { timers.push(fn); return realTimeout(fn, 0); };
  try {
    const result = await resolver.resolve({url: 'https://vault.example/abc123def456'});
    assert.deepEqual(result, {url: 'https://cdn.vault.example/files/game.pkg', rejectHtml: true, expectedBytes: 1234});
  } finally {
    globalThis.setTimeout = realTimeout;
  }
  assert.equal(posts[0].method_free, 'Free Download');
  assert.equal(posts[0].method_premium, undefined);
  assert.equal(posts[1]['g-recaptcha-response'], 'TOKEN');
  assert.equal(posts[1].op, 'download2');
});

test('without a key the host is left to the browser', async () => {
  const error = new BrowserRequired('https://vault.example/abc');
  const resolver = createCaptchaResolver({http: {}, apiKey: () => '', fallback: {resolve: async () => { throw error; }}});
  await assert.rejects(resolver.resolve({url: 'https://vault.example/abc'}), (thrown) => thrown === error);
});

test('DataVaults: the solved form goes to the download engine as a POST', async () => {
  const pageOne = page2.replace('https://vault.example/abc123def456', 'https://datavaults.co/abc123def456');
  const http = {async request(url, options = {}) {
    const respond = (status, body = '') => ({ok: status < 300, status, url, headers: {}, text: async () => body, json: async () => JSON.parse(body)});
    if (url.includes('createTask')) return respond(200, JSON.stringify({errorId: 0, taskId: 1}));
    if (url.includes('getTaskResult')) return respond(200, JSON.stringify({errorId: 0, status: 'ready', solution: {gRecaptchaResponse: 'T'}}));
    return respond(200, pageOne);
  }};
  const resolver = createCaptchaResolver({http, apiKey: () => 'k', fallback: {resolve: async (release) => { throw new BrowserRequired(release.url); }}});
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realTimeout(fn, 0);
  try {
    const result = await resolver.resolve({url: 'https://datavaults.co/abc123def456'});
    assert.equal(result.method, 'POST');
    assert.equal(result.url, 'https://datavaults.co/abc123def456');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(result.body)), {op: 'download2', id: 'abc123def456', rand: 'r4nd', 'g-recaptcha-response': 'T'});
  } finally {
    globalThis.setTimeout = realTimeout;
  }
});

test('finds the countdown and the file link as JDownloader does', async () => {
  const {countdown, linkIn} = await import('./captcha.js');
  assert.equal(countdown('<span class="seconds">15</span>'), 15);
  assert.equal(countdown('<span id="countdown_str">Wait <span id="cx">7</span></span>'), 7);
  assert.equal(linkIn('<a href="https://s1.host.example/d/abcdef123/Game.rar">x</a> "https://s1.host.example/d/abcdef123/Game.rar"'), 'https://s1.host.example/d/abcdef123/Game.rar');
  assert.equal(linkIn('<a href="https://cdn.example/x?y=1" class="btn">Direct Download Link</a>'), 'https://cdn.example/x?y=1');
});
