// ADDED: 2Captcha (https://2captcha.com), for a host page with a captcha that neither TorBox nor
// Premiumize takes. Many file hosts (DataVaults among them) run XFileSharing: a page whose form posts
// op=download1, then a page whose form posts op=download2 behind a countdown and a captcha. The app
// posts those forms itself; XFileSharing's own digit captcha is read from the page for free, and a
// reCAPTCHA, hCaptcha or Turnstile is sent to 2Captcha with the account's key, its token posted with
// the form. Whatever goes wrong, the host's own way (the console's browser) is left as it was.
// A Cloudflare check in front of a whole site (HTTP 403) is not a captcha this passes.

import { getDebridKey } from './debrid.js';
import { BrowserRequired, webURL } from './download-sources.js';

  var API = "https://api.2captcha.com";
  var POLL_MS = 5e3;
  var MAX_SOLVE_MS = 3 * 60 * 1e3;
  var MAX_COUNTDOWN_S = 120;
  // The paused hosts the key opens in the catalog (paused-hosts.js): their captcha is the step the
  // console's browser could not pass.
  var SOLVER_HOSTS = ["datavaults.co"];
  var isHost = (host2, domain) => host2 === domain || host2.endsWith(`.${domain}`);
  function solverTakes(release) {
    if (!getDebridKey("twocaptcha")) return false;
    if (/^datavaults$/i.test(release?.provider || "")) return true;
    try {
      const host2 = webURL(release.browserUrl || release.url).host;
      return SOLVER_HOSTS.some((domain) => isHost(host2, domain));
    } catch {
      return false;
    }
  }
  var wait = (ms, signal) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  var decode = (value) => String(value ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  var attr = (tag, key) => {
    const found = new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return found ? decode(found[1] ?? found[2] ?? found[3]) : void 0;
  };
  var form = (fields) => Object.entries(fields).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  // The form that posts `op` (download1 or download2), with its fields and the address it posts to.
  function xfsForm(html, base) {
    for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
      const fields = {};
      for (const input of match[2].match(/<input\b[^>]*>/gi) || []) {
        const name = attr(input, "name");
        const type = (attr(input, "type") || "").toLowerCase();
        if (!name || type === "checkbox" && !/\bchecked\b/i.test(input)) continue;
        if (type === "submit" && name in fields) continue;
        fields[name] = attr(input, "value") ?? "";
      }
      if (!/^download[12]$/.test(fields.op || "")) continue;
      const action = attr(match[1], "action");
      let target = base;
      try {
        if (action && !action.startsWith("#")) target = new URL(action, base).href;
      } catch {
      }
      return { fields, target, body: match[2] };
    }
    return null;
  }
  // XFileSharing's own captcha: each digit a span placed by its padding-left, read left to right.
  function digitCaptcha(html) {
    const box = /<td\b[^>]*>\s*<div\b[^>]*width\s*:\s*80px[\s\S]*?<\/div>/i.exec(html)?.[0] ?? /class=["']?captcha_code["']?[\s\S]{0,40}?<\/td>/i.exec(html)?.[0];
    if (!box) return null;
    const digits = [...box.matchAll(/<span\b[^>]*padding-left\s*:\s*(\d+)px[^>]*>\s*(?:&#(\d+);|(\d))\s*<\/span>/gi)].map((found) => ({ at: Number(found[1]), digit: found[2] ? String.fromCharCode(Number(found[2])) : found[3] }));
    return digits.length >= 3 ? digits.sort((a, b) => a.at - b.at).map((found) => found.digit).join("") : null;
  }
  function widget(html) {
    for (const [pattern, type, field] of [
      [/class=["'][^"']*\bcf-turnstile\b[^"']*["'][^>]*|data-sitekey=["'][^"']+["'][^>]*class=["'][^"']*\bcf-turnstile\b/i, "TurnstileTaskProxyless", "cf-turnstile-response"],
      [/class=["'][^"']*\bh-captcha\b[^"']*["'][^>]*|data-sitekey=["'][^"']+["'][^>]*class=["'][^"']*\bh-captcha\b/i, "HCaptchaTaskProxyless", "h-captcha-response"],
      [/class=["'][^"']*\bg-recaptcha\b[^"']*["'][^>]*|data-sitekey=["'][^"']+["'][^>]*class=["'][^"']*\bg-recaptcha\b/i, "RecaptchaV2TaskProxyless", "g-recaptcha-response"]
    ]) {
      const found = pattern.exec(html);
      if (!found) continue;
      const tag = html.slice(Math.max(0, html.lastIndexOf("<", found.index)), html.indexOf(">", found.index + found[0].length) + 1);
      const key = attr(tag, "data-sitekey");
      if (key) return { type, field, key };
    }
    return null;
  }
  async function twoCaptcha(http, path, payload, signal) {
    const response = await http.request(`${API}${path}`, { method: "POST", signal, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    let data = null;
    try {
      data = await response.json();
    } catch {
    }
    if (!response.ok || !data) throw new Error(`2Captcha answered HTTP ${response.status}.`);
    if (data.errorId) throw new Error(`2Captcha: ${data.errorDescription || data.errorCode || "error"}.`);
    return data;
  }
  async function solve(http, key, task, signal, onStatus) {
    const { taskId } = await twoCaptcha(http, "/createTask", { clientKey: key, task }, signal);
    console.log(`[captcha] ${task.type} sent to 2Captcha`);
    const started = Date.now();
    for (; ; ) {
      await wait(POLL_MS, signal);
      if (signal?.aborted) throw new Error("Cancelled.");
      onStatus?.(null);
      const result = await twoCaptcha(http, "/getTaskResult", { clientKey: key, taskId }, signal);
      if (result.status === "ready") return result.solution?.gRecaptchaResponse || result.solution?.token;
      if (Date.now() - started > MAX_SOLVE_MS) throw new Error("2Captcha took too long.");
    }
  }
  var FILE_LINK = /href=["'](https?:\/\/[^"']+\.(?:pkg|ffpkg|exfat|ffpfs|ffpfsc|zip|rar|7z|r\d\d|\d{3})(?:\?[^"']*)?)["']/i;
  function createCaptchaResolver({ http, apiKey = () => getDebridKey("twocaptcha"), fallback }) {
    const page = async (url, options = {}) => {
      webURL(url);
      const response = await http.request(url, { maxBytes: 2 * 1024 * 1024, followRedirects: false, ...options, headers: { Referer: url, ...options.headers } });
      if (response.status === 403 || response.status === 429) throw new Error(`the host answered HTTP ${response.status}`);
      return response;
    };
    const post = (target, fields, signal, referer) => page(target, { method: "POST", signal, headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: referer }, body: form(fields) });
    async function file(response, base, signal) {
      const location = response.headers?.location;
      const link = location ? new URL(location, base).href : FILE_LINK.exec(await response.text())?.[1];
      if (!link) return null;
      const url = webURL(decode(link)).url;
      const head = await http.request(url, { method: "HEAD", signal });
      if (!head.ok || /text\/html/i.test(head.headers?.["content-type"] || "")) return null;
      const bytes = Number(head.headers?.["content-length"]);
      return { url: webURL(head.url || url).url, rejectHtml: true, ...Number.isSafeInteger(bytes) && bytes > 0 ? { expectedBytes: bytes } : {} };
    }
    async function pass(url, key, { signal, onStatus } = {}) {
      let response = await page(url, { signal });
      let html = await response.text();
      let step = xfsForm(html, url);
      if (step?.fields.op === "download1") {
        const { method_premium: _premium, ...fields } = step.fields;
        response = await post(step.target, { ...fields, method_free: fields.method_free || "Free Download" }, signal, url);
        const found = await file(response, url, signal);
        if (found) return found;
        html = await response.text();
        step = xfsForm(html, url);
      }
      if (step?.fields.op !== "download2") throw new Error("no download form on the page");
      const fields = { ...step.fields };
      const seconds = Number(/id=["']countdown["'][\s\S]{0,200}?(\d{1,3})\s*</i.exec(html)?.[1]) || 0;
      const started = Date.now();
      const digits = digitCaptcha(step.body);
      if (digits) fields.code = digits;
      const challenge = widget(html);
      if (challenge) {
        const token = await solve(http, key, { type: challenge.type, websiteURL: url, websiteKey: challenge.key }, signal, onStatus);
        if (!token) throw new Error("2Captcha returned no token");
        fields[challenge.field] = token;
        if (challenge.field === "h-captcha-response") fields["g-recaptcha-response"] = token;
      }
      const left = Math.min(seconds, MAX_COUNTDOWN_S) * 1e3 + 1e3 - (Date.now() - started);
      if (left > 0) await wait(left, signal);
      if (signal?.aborted) throw new Error("Cancelled.");
      const found = await file(await post(step.target, fields, signal, url), url, signal);
      if (!found) throw new Error("the host gave no file after the captcha");
      return found;
    }
    async function resolve2(release, options = {}) {
      try {
        return await fallback.resolve(release, options);
      } catch (error2) {
        const key = apiKey();
        const url = release.browserUrl || release.url;
        if (!(error2 instanceof BrowserRequired) || !key || options.directURL || !url || options.signal?.aborted) throw error2;
        try {
          return await pass(webURL(url).url, key, options);
        } catch (failed) {
          if (options.signal?.aborted) throw failed;
          console.log(`[captcha] ${release.provider || "the host"} not passed: ${failed.message}`);
          throw error2;
        }
      }
    }
    return { resolve: resolve2, debrid: () => Boolean(fallback.debrid?.()) };
  }

export { createCaptchaResolver, digitCaptcha, solverTakes, widget, xfsForm };
