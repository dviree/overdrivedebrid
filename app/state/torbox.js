// ADDED: downloads through TorBox (https://torbox.app), a debrid service.
// With an API key set, every source link is handed to TorBox's web downloads first: TorBox fetches
// the file from the host onto its own servers (at once when it already has it cached), and the
// console then downloads it from TorBox's CDN. Hosts behind a captcha or a wait, and slow hosts,
// come down at the speed of the connection. A link TorBox won't take (a host it doesn't support)
// goes the usual way, through the app's own resolver. A key TorBox refuses fails the download, so
// a wrong key never passes unnoticed.

import { webURL } from './download-sources.js';

  var API = "https://api.torbox.app/v1/api";
  // A cached file is ready at once; one TorBox fetches first is polled until it is on its servers.
  var POLL_MS = 5e3;
  var MAX_WAIT_MS = 6 * 60 * 60 * 1e3;
  var FAILED = /^(?:failed|error|stalled \(no seeds\)|missingfiles)/i;
  var AUTH = /AUTH_ERROR|BAD_TOKEN|NO_AUTH|invalid api key|unauthori[sz]ed/i;
  var TorboxRefused = class extends Error {
    constructor(message) {
      super(message);
      this.name = "TorboxRefused";
    }
  };
  function multipart(fields) {
    const boundary = `----overdrive${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const body = Object.entries(fields).filter(([, value]) => value != null && value !== "").map(([name, value]) => `--${boundary}\r
Content-Disposition: form-data; name="${name}"\r
\r
${value}\r
`).join("") + `--${boundary}--\r
`;
    return { body, type: `multipart/form-data; boundary=${boundary}` };
  }
  function createTorboxResolver({ http, fallback, apiKey, wait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms)), now = Date.now }) {
    async function call(path, { key, signal, method = "GET", form } = {}) {
      const options = { method, signal, maxBytes: 1024 * 1024, followRedirects: false, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } };
      if (form) {
        const { body, type } = multipart(form);
        options.body = body;
        options.headers["Content-Type"] = type;
      }
      const response = await http.request(`${API}${path}`, options);
      let payload = null;
      try {
        payload = await response.json();
      } catch {
      }
      const detail = payload?.detail || payload?.error || `HTTP ${response.status}`;
      if (response.status === 401 || response.status === 403 || AUTH.test(`${payload?.error || ""} ${payload?.detail || ""}`))
        throw new Error(`TorBox refused the API key (${detail}). Check it in Settings.`);
      if (!response.ok || payload?.success === false) throw new TorboxRefused(`TorBox: ${detail}`);
      return payload?.data;
    }
    async function cached(link, key, signal) {
      try {
        const list = await call(`/webdl/mylist?bypass_cache=true`, { key, signal });
        return (Array.isArray(list) ? list : []).find((item) => item?.original_url === link && !FAILED.test(item.download_state || "")) ?? null;
      } catch (error2) {
        if (error2 instanceof TorboxRefused) return null;
        throw error2;
      }
    }
    async function finished(id, key, signal, onStatus) {
      const started = now();
      for (; ; ) {
        if (signal?.aborted) throw new Error("Cancelled.");
        const item = await call(`/webdl/mylist?id=${encodeURIComponent(id)}&bypass_cache=true`, { key, signal });
        const state = String(item?.download_state || "");
        if (FAILED.test(state)) throw new Error(`TorBox could not fetch the file (${state}). Choose another source.`);
        if ((item?.download_finished || item?.download_present) && item.files?.length) return item;
        onStatus?.(typeof item?.progress === "number" ? item.progress : null);
        if (now() - started > MAX_WAIT_MS) throw new Error("TorBox is still fetching the file. Retry later.");
        await wait(POLL_MS);
      }
    }
    async function viaTorbox(release, key, { signal, onStatus } = {}) {
      const link = webURL(release.browserUrl || release.url).url;
      let id = (await cached(link, key, signal))?.id;
      if (id == null) {
        const created = await call("/webdl/createwebdownload", { key, signal, method: "POST", form: { link, name: release.filename } });
        id = created?.webdownload_id ?? created?.id;
        if (id == null) throw new TorboxRefused("TorBox did not return a download.");
      }
      onStatus?.(null);
      const item = await finished(id, key, signal, onStatus);
      const file = [...item.files].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
      const url = await call(`/webdl/requestdl?token=${encodeURIComponent(key)}&web_id=${encodeURIComponent(id)}&file_id=${encodeURIComponent(file.id)}&zip_link=false&redirect=false`, { key, signal });
      if (typeof url !== "string") throw new Error("TorBox did not return a download link. Retry.");
      return { url: webURL(url).url, rejectHtml: true };
    }
    async function resolve2(release, options = {}) {
      const key = apiKey();
      // A link captured from the console browser is already the final file, tied to that session.
      if (!key || options.directURL || release.manifestUrl || !(release.browserUrl || release.url)) return fallback.resolve(release, options);
      try {
        return await viaTorbox(release, key, options);
      } catch (error2) {
        if (!(error2 instanceof TorboxRefused) || options.signal?.aborted) throw error2;
        console.log(`[torbox] ${error2.message}; resolving ${release.provider || "the source"} directly`);
        return fallback.resolve(release, options);
      }
    }
    return { resolve: resolve2, debrid: () => Boolean(apiKey()) };
  }

export { createTorboxResolver };
