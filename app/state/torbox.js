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
  // TorBox limits how often an account calls it; a 429 says how long to wait (Retry-After, in
  // seconds), which is waited up to a minute, three times, before the call fails.
  var THROTTLE_TRIES = 3;
  var defaultWait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
  function torboxApi(http, wait = defaultWait) {
    return async function call(path, { key, signal, method = "GET", form } = {}, tries = 0) {
      const options = { method, signal, maxBytes: 4 * 1024 * 1024, followRedirects: false, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } };
      if (form) {
        const { body, type } = multipart(form);
        options.body = body;
        options.headers["Content-Type"] = type;
      }
      const response = await http.request(`${API}${path}`, options);
      if (response.status === 429 && tries < THROTTLE_TRIES && !signal?.aborted) {
        const seconds = Number(response.headers?.["retry-after"]);
        await wait(Math.min(60, Number.isFinite(seconds) && seconds > 0 ? seconds : 5 * (tries + 1)) * 1e3);
        return call(path, { key, signal, method, form }, tries + 1);
      }
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
    };
  }
  // What the account holds: torrents, web downloads and usenet. Each ready file is one entry the
  // queue can download, so links added on torbox.app from a computer show up on the console.
  var KINDS = {
    torrent: { list: "/torrents/mylist", request: "/torrents/requestdl", param: "torrent_id" },
    webdl: { list: "/webdl/mylist", request: "/webdl/requestdl", param: "web_id" },
    usenet: { list: "/usenet/mylist", request: "/usenet/requestdl", param: "usenet_id" }
  };
  async function requestLink(call, key, { kind, id, file }, signal) {
    const { request, param } = KINDS[kind];
    const url = await call(`${request}?token=${encodeURIComponent(key)}&${param}=${encodeURIComponent(id)}&file_id=${encodeURIComponent(file)}&zip_link=false&redirect=false`, { key, signal });
    if (typeof url !== "string") throw new Error("TorBox did not return a download link. Retry.");
    return { url: webURL(url).url, rejectHtml: true };
  }
  var baseName = (name) => String(name || "").split("/").pop().replace(/[\x00-\x1f\\]/g, "").slice(-200) || "torbox-file";
  function createTorboxAccount({ http, apiKey }) {
    const call = torboxApi(http);
    async function list({ signal } = {}) {
      const key = apiKey();
      if (!key) throw new Error("Add your TorBox API key first.");
      const entries = [];
      for (const kind of Object.keys(KINDS)) {
        let items;
        try {
          items = await call(`${KINDS[kind].list}?bypass_cache=true`, { key, signal });
        } catch (error2) {
          if (error2 instanceof TorboxRefused) continue;
          throw error2;
        }
        for (const item of Array.isArray(items) ? items : []) {
          const ready = Boolean(item?.download_finished || item?.download_present);
          for (const file of item?.files || []) {
            entries.push({
              key: `${kind}-${item.id}-${file.id}`,
              kind,
              id: item.id,
              file: file.id,
              name: baseName(file.short_name || file.name),
              item: item.name || "",
              sizeBytes: Number(file.size) || null,
              ready,
              state: String(item.download_state || ""),
              progress: typeof item.progress === "number" ? item.progress : null,
              added: Date.parse(item.created_at || "") || 0
            });
          }
          if (!item?.files?.length) entries.push({ key: `${kind}-${item?.id}`, kind, id: item?.id, file: null, name: baseName(item?.name), item: "", sizeBytes: Number(item?.size) || null, ready: false, state: String(item?.download_state || ""), progress: typeof item?.progress === "number" ? item.progress : null, added: Date.parse(item?.created_at || "") || 0 });
        }
      }
      return entries.sort((a, b) => b.added - a.added || a.name.localeCompare(b.name)).slice(0, 200);
    }
    // A release the download queue takes like a catalog one; the link is asked for when it starts,
    // so a TorBox link that expired is asked for again.
    function release(entry2) {
      if (!entry2.ready || entry2.file == null) throw new Error("TorBox hasn't finished this one yet.");
      const ext = /\.([a-z0-9]{1,8})$/i.exec(entry2.name)?.[1]?.toLowerCase();
      return {
        id: `torbox-${entry2.key}`,
        filename: entry2.name,
        format: ext && ["pkg", "fpkg", "exfat", "ffpkg", "ffpfs", "ffpfsc", "zip", "rar", "7z"].includes(ext) ? ext : "binary",
        url: "https://torbox.app/",
        provider: "TorBox",
        label: entry2.item || entry2.name,
        sizeBytes: entry2.sizeBytes,
        torbox: { kind: entry2.kind, id: entry2.id, file: entry2.file }
      };
    }
    // Hands a link to TorBox: a magnet link as a torrent, anything else as a web download.
    async function add(link) {
      const key = apiKey();
      if (!key) throw new Error("Add your TorBox API key first.");
      const value = String(link || "").trim();
      if (/^magnet:\?/i.test(value)) return call("/torrents/createtorrent", { key, method: "POST", form: { magnet: value } });
      return call("/webdl/createwebdownload", { key, method: "POST", form: { link: webURL(value).url } });
    }
    return { add, list, release };
  }
  function createTorboxResolver({ http, fallback, apiKey, wait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms)), now = Date.now }) {
    const call = torboxApi(http, wait);
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
      return requestLink(call, key, { kind: "webdl", id, file: file.id }, signal);
    }
    async function resolve2(release, options = {}) {
      const key = apiKey();
      if (release.torbox) {
        if (!key) throw new Error("This download is from TorBox: add your TorBox API key in Settings.");
        return requestLink(call, key, release.torbox, options.signal);
      }
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
    return { resolve: resolve2, debrid: () => Boolean(apiKey()) || Boolean(fallback?.debrid?.()) };
  }

export { createTorboxAccount, createTorboxResolver };
