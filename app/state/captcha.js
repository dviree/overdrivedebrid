// ADDED: 2Captcha (https://2captcha.com), for a host page with a captcha that neither TorBox nor
// Premiumize takes. Many file hosts (DataVaults among them) run XFileSharing: a page whose form posts
// op=download1, then a page whose form posts op=download2 behind a countdown and a captcha. The app
// posts those forms itself; XFileSharing's own digit captcha is read from the page for free, and a
// reCAPTCHA, hCaptcha or Turnstile is sent to 2Captcha with the account's key, its token posted with
// the form. The steps follow JDownloader's XFileSharingProBasic (its forms, countdowns, captcha kinds
// and link patterns). Whatever goes wrong, the host's own way (the console's browser) is left as it was.
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
  // Hosts whose answer to the download2 form is the file, not a page or a redirect to it (DataVaults:
  // upstream's note in paused-hosts.js), so the form goes to the download engine as a POST.
  var POST_HOSTS = ["datavaults.co"];
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
  function formsIn(html, base) {
    return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => {
      const fields = {};
      for (const input of match[2].match(/<(?:input|button)\b[^>]*>/gi) || []) {
        const name = attr(input, "name");
        const type = (attr(input, "type") || "").toLowerCase();
        if (!name || type === "checkbox" && !/\bchecked\b/i.test(input) || /^<button/i.test(input) && attr(input, "value") == null) continue;
        if (type === "submit" && name in fields) continue;
        fields[name] = attr(input, "value") ?? "";
      }
      const action = attr(match[1], "action");
      let target = base;
      try {
        if (action && !action.startsWith("#")) target = new URL(action, base).href;
      } catch {
      }
      return { fields, target, body: match[2], name: attr(match[1], "name") };
    });
  }
  // The form of an XFileSharing step, found as JDownloader's XFileSharingProBasic finds it: download1
  // by its op; download2 first as a form with a method_ field whose op names a download, then as the
  // form named F1, then by its op.
  function xfsForm(html, base) {
    const forms = formsIn(html, base);
    const first = forms.find((found) => found.fields.op === "download1");
    if (first) {
      const { method_premium: _premium, ...fields } = first.fields;
      return { ...first, fields: { ...fields, method_free: fields.method_free || "Free Download" } };
    }
    const second = forms.find((found) => /method_/.test(found.body) && /download/.test(found.fields.op || "")) ?? forms.find((found) => found.name === "F1") ?? forms.find((found) => found.fields.op === "download2");
    if (!second) return null;
    if ("adblock_detected" in second.fields && !second.fields.adblock_detected) second.fields.adblock_detected = "0";
    return second;
  }
  // XFileSharing's own captcha ("plaintext" in JDownloader): each digit a span placed by its
  // padding-left inside a grey box, read left to right.
  function digitCaptcha(html) {
    if (!/;background:#ccc;text-align/i.test(html)) return null;
    const digits = [...html.matchAll(/<span style=.position:absolute;padding-left:(\d+)px;padding-top:\d+px;.>(&#(\d+);|\d)<\/span>/gi)].map((found) => ({ at: Number(found[1]), digit: found[3] ? String.fromCharCode(Number(found[3])) : found[2] }));
    if (!digits.length) return null;
    return [...new Map(digits.map((found) => [found.at, found.digit]))].sort((a, b) => a[0] - b[0]).map(([, digit]) => digit).join("");
  }
  // The captcha widget in a form: Turnstile, hCaptcha or reCAPTCHA v2 by its class, else a site key
  // alone counts as reCAPTCHA, as JDownloader takes it.
  function widget(html) {
    const key = /data-sitekey\s*=\s*["']([^"']+)/i.exec(html)?.[1];
    if (!key) return null;
    if (/\bcf-turnstile\b/i.test(html)) return { type: "TurnstileTaskProxyless", field: "cf-turnstile-response", key };
    if (/\bh-captcha\b/i.test(html)) return { type: "HCaptchaTaskProxyless", field: "h-captcha-response", key };
    return { type: "RecaptchaV2TaskProxyless", field: "g-recaptcha-response", key };
  }
  // The countdown before download2 may be sent, by JDownloader's patterns.
  function countdown(html) {
    for (const pattern of [/id=["']countdown_str["'][^>]*>[^<>]*<span id=[^>]*>\s*(\d+)\s*<\/span>/i, /class="seconds"[^>]*>\s*(\d+)\s*</i, /id="seconds"[^>]*>\s*(\d+)\s*</i]) {
      const found = pattern.exec(html)?.[1];
      if (found) return Number(found);
    }
    return 0;
  }
  // The file's link in an XFileSharing answer page, by JDownloader's patterns.
  var LINKS = [
    /"(https?:\/\/[^"<>\/]+(?::\d+)?\/(?:files|d|cgi-bin\/dl\.cgi|dl)\/(?:\d+\/)?[a-z0-9]+\/[^<>"\/]*)"/i,
    /href="(https?:\/\/[^"]+)"[^>]*>\s*(?:<i[^>]*>[^>]*\/i>)?\s*Direct Download Link/i,
    /href="(https?:\/\/[^"]+)"[^>]*>\s*<i[^>]*class\s*=\s*"[^"]*fa-download[^"]*"/i,
    /href=["'](https?:\/\/[^"']+\.(?:pkg|ffpkg|exfat|ffpfs|ffpfsc|zip|rar|7z)(?:\?[^"']*)?)["']/i
  ];
  var linkIn = (html) => LINKS.map((pattern) => pattern.exec(html)?.[1]).find(Boolean);
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
      const link = location ? new URL(location, base).href : linkIn(await response.text());
      if (!link) return null;
      const url = webURL(decode(link)).url;
      const head = await http.request(url, { method: "HEAD", signal });
      if (!head.ok || /text\/html/i.test(head.headers?.["content-type"] || "")) return null;
      const bytes = Number(head.headers?.["content-length"]);
      return { url: webURL(head.url || url).url, rejectHtml: true, ...Number.isSafeInteger(bytes) && bytes > 0 ? { expectedBytes: bytes } : {} };
    }
    async function pass(url, key, { signal, onStatus } = {}) {
      let html = await (await page(url, { signal })).text();
      let step = xfsForm(html, url);
      if (step?.fields.op === "download1") {
        const wait1 = countdown(html);
        if (wait1) await wait(Math.min(wait1, MAX_COUNTDOWN_S) * 1e3 + 1e3, signal);
        const response = await post(step.target, step.fields, signal, url);
        const found = await file(response, url, signal);
        if (found) return found;
        html = await response.text();
        step = xfsForm(html, url);
      }
      if (!step || step.fields.op === "download1") throw new Error("no download form on the page");
      const fields = { ...step.fields };
      const seconds = countdown(html);
      const started = Date.now();
      const digits = digitCaptcha(step.body);
      if (digits) fields.code = digits;
      const challenge = widget(step.body) ?? (/\$\.post\(\s*"\/ddl"/i.test(html) ? widget(html) : null);
      if (challenge) {
        const token = await solve(http, key, { type: challenge.type, websiteURL: url, websiteKey: challenge.key }, signal, onStatus);
        if (!token) throw new Error("2Captcha returned no token");
        if (/\$\.post\(\s*"\/ddl"/i.test(html)) {
          // Some XFileSharing sites check the captcha by itself first, at /ddl, then take the form
          // without it (JDownloader's "ajax" captcha handling).
          const check = { op: "captcha1", [challenge.field]: token };
          if (fields.rand) check.rand = fields.rand;
          const fileId = /"file_id"\s*:\s*"?([^",}]+)/.exec(html)?.[1];
          if (fileId) check.file_id = fileId;
          const answer = await (await page(new URL("/ddl", url).href, { method: "POST", signal, headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Referer: url }, body: form(check) })).text();
          if (answer.trim().toUpperCase() !== "OK") throw new Error(`the host refused the captcha (${answer.trim().slice(0, 40)})`);
          fields["g-recaptcha-response"] = "";
        } else {
          fields[challenge.field] = token;
          if (challenge.field === "h-captcha-response") fields["g-recaptcha-response"] = token;
        }
      }
      const left = Math.min(seconds, MAX_COUNTDOWN_S) * 1e3 + 1e3 - (Date.now() - started);
      if (left > 0) await wait(left, signal);
      if (signal?.aborted) throw new Error("Cancelled.");
      // A host whose answer to the form is the file itself: the download engine sends the form, once.
      if (POST_HOSTS.some((domain) => isHost(webURL(step.target).host, domain))) return { url: webURL(step.target).url, method: "POST", body: form(fields), rejectHtml: true };
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

export { countdown, createCaptchaResolver, digitCaptcha, linkIn, solverTakes, widget, xfsForm };
