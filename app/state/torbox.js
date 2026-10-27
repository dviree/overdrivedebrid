// TorBox (issue #20): a magnet or a link another host refuses is handed to TorBox's API, which
// fetches it on its own servers and then gives a direct link to the file, which the normal queue
// downloads. TorBox keeps what it fetched, so pasting the same magnet again is instant.
//
// The API key is the user's own, saved on the console (download-services.js); nothing is sent
// anywhere else. Every call answers { success, error, detail, data }; only data is returned.
//
// MODIFIED (dviree/overdrivedebrid): the one TorBox module, for pasted links and for this fork's
// debrid chain alike (downloads.js, torbox-queue.js), on the flow checked against the live API. The
// fork adds: calls wait out TorBox's rate limit (429, Retry-After), the account's files are listed
// for the Debrid sheet and the computer page, and createTorboxResolver hands every catalog link to
// TorBox first. A failure that is TorBox declining the link (TorboxRefused) lets the next service
// try; a refused key never does.

import { webURL } from './download-sources.js';
import { linkInput } from './link-download.js';

  var API = "https://api.torbox.app";
  var TORRENTS = "/v1/api/torrents";
  var WEB = "/v1/api/webdl";
  // A cached file is ready in a second or two; one TorBox has to fetch waits this long at most,
  // then the user can add it again later (TorBox keeps fetching it in the meantime).
  var WAIT_MS = 30 * 60e3;
  var FIRST_MS = 2e3;
  var THEN_MS = 5e3;

  var FAILED = /^(error|failed|missingfiles|uploaderror|downloaderror)$/i;

  // TorBox declining a link (a host it doesn't take, a file it can't fetch): the debrid chain then
  // asks the next service. A refused key is a plain Error, so it never passes unnoticed.
  var TorboxRefused = class extends Error {
    constructor(message2) {
      super(message2);
      this.name = "TorboxRefused";
    }
  };
  // TorBox limits how often an account calls it; a 429 says how long to wait (Retry-After, in
  // seconds), which is waited up to a minute, three times, before the call fails.
  var THROTTLE_TRIES = 3;
  var defaultWait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
  var KEY_REFUSED = "TorBox rejected the API key. Enter it again in the download settings.";

  // The one way this app calls TorBox: form fields URL-encoded, the key as a bearer token, and only
  // the answer's data returned.
  function torboxCall({ http, key, wait = defaultWait }) {
    return async function call(path, { method = "GET", form, signal } = {}, tries = 0) {
      const response = await http.request(API + path, {
        method,
        signal,
        maxBytes: 4 * 1024 * 1024,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
        },
        ...(form ? { body: form } : {})
      });
      if (response.status === 429 && tries < THROTTLE_TRIES && !signal?.aborted) {
        const seconds = Number(response.headers?.["retry-after"]);
        await wait(Math.min(60, Number.isFinite(seconds) && seconds > 0 ? seconds : 5 * (tries + 1)) * 1e3);
        return call(path, { method, form, signal }, tries + 1);
      }
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
      }
      // Whatever the body says, these two are the key: the API has none of its own to refuse.
      if (response.status === 401 || response.status === 403) throw new Error(KEY_REFUSED);
      if (!json || typeof json !== "object") throw new TorboxRefused(`TorBox answered HTTP ${response.status}.`);
      if (!json.success) {
        const reason = message(json, response.status);
        throw reason === KEY_REFUSED ? new Error(reason) : new TorboxRefused(reason);
      }
      return json.data;
    };
  }

  function message(json, status) {
    const detail = json && typeof json.detail === "string" ? json.detail.trim() : "";
    const error = json && typeof json.error === "string" ? json.error : "";
    if (/BAD_TOKEN|AUTH_ERROR|BAD_API_KEY|INVALID_TOKEN/i.test(error + detail))
      return KEY_REFUSED;
    if (/TOO_MANY|RATE_LIMIT/i.test(error + detail)) return "TorBox is rate limiting the key. Try again in a minute.";
    return detail || (error ? `TorBox: ${error}.` : `TorBox answered HTTP ${status}.`);
  }

  // The torrent or web download an answer names, whatever the endpoint calls it.
  function createdId(kind, data) {
    const item = Array.isArray(data) ? data[0] : data;
    if (!item || typeof item !== "object") return null;
    const id = kind === "torrent" ? item.torrent_id ?? item.id : item.web_id ?? item.webdownload_id ?? item.id;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  function listItem(kind, data) {
    const item = Array.isArray(data) ? data.find((entry) => entry && (entry.id ?? entry.torrent_id ?? entry.web_id)) ?? data[0] : data;
    return item && typeof item === "object" ? item : null;
  }

  // Whether the item is fetched and ready: TorBox's own flag, its state, or full progress.
  function ready(item) {
    if (!item) return false;
    if (item.download_finished === true || item.download_present === true) return true;
    if (typeof item.download_state === "string" && /^(cached|completed|uploading)$/i.test(item.download_state)) return true;
    return Number(item.progress) >= 1 && Number(item.size) > 0;
  }

  function failed(item) {
    if (!item) return "";
    const state = String(item.download_state ?? "");
    if (!FAILED.test(state)) return "";
    return `TorBox could not fetch it (${state.toLowerCase()}).`;
  }

  // The file to download: the largest one, so a release's own .nfo or sample is passed over.
  function pickFile(files) {
    if (!Array.isArray(files)) return null;
    let best = null;
    for (const file of files) {
      if (!file || !Number.isSafeInteger(file.id)) continue;
      const size = Number(file.size) || 0;
      if (!best || size > (Number(best.size) || 0)) best = file;
    }
    return best;
  }

  function baseName(value) {
    const text = String(value ?? "");
    const cut = text.slice(text.lastIndexOf("/") + 1);
    return cut || text;
  }

  function createTorbox({ http, key, wait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms)), now = Date.now, timeoutMs = WAIT_MS }) {
    if (!key) throw new Error("TorBox is not set up.");

    const call = torboxCall({ http, key, wait });

    // Adds the link or magnet: a magnet is a torrent, anything else a web download. Both answer
    // with the item's id, which the status and the download link are asked for by.
    async function create(input, { signal } = {}) {
      const parsed = linkInput(input);
      if (parsed.kind === "magnet") {
        const data = await call(`${TORRENTS}/createtorrent`, { method: "POST", form: `magnet=${encodeURIComponent(parsed.value)}`, signal });
        const id = createdId("torrent", data);
        if (!id) throw new Error("TorBox took the magnet but named no torrent.");
        return { kind: "torrent", id };
      }
      const data = await call(`${WEB}/createwebdownload`, { method: "POST", form: `link=${encodeURIComponent(parsed.value)}`, signal });
      const id = createdId("web", data);
      if (!id) throw new Error("TorBox took the link but named no download.");
      return { kind: "web", id };
    }

    async function status({ kind, id }, { signal } = {}) {
      const data = await call(`${kind === "torrent" ? TORRENTS : WEB}/mylist?id=${id}`, { signal });
      return listItem(kind, data);
    }

    // Waits until TorBox has the file, reporting progress as a fraction of the item's size.
    async function fetched(created, { onProgress, signal } = {}) {
      const end = now() + timeoutMs;
      let pause = FIRST_MS;
      for (;;) {
        const item = await status(created, { signal });
        if (!item) throw new Error("TorBox does not list the download any more.");
        const failure = failed(item);
        if (failure) throw new Error(failure);
        if (ready(item) && pickFile(item.files)) return item;
        if (onProgress) onProgress({ progress: Number(item.progress) || 0, state: String(item.download_state ?? "") });
        if (signal?.aborted) throw new Error("Cancelled.");
        if (now() >= end)
          throw new Error("TorBox is still fetching it. Add it again later: TorBox keeps working on it.");
        await wait(pause);
        pause = THEN_MS;
      }
    }

    // The direct link to one file, valid for a few hours and carrying the key.
    async function link({ kind, id }, file, { signal } = {}) {
      const query3 = kind === "torrent" ? `torrent_id=${id}` : `web_id=${id}`;
      const data = await call(`${kind === "torrent" ? TORRENTS : WEB}/requestdl?token=${encodeURIComponent(key)}&${query3}&file_id=${file.id}`, { signal });
      if (typeof data !== "string" || !/^https?:\/\//.test(data)) throw new TorboxRefused("TorBox gave no download link for the file.");
      return data;
    }

    /** Hands the input to TorBox and waits for the file; resolves to what addLink() needs. */
    async function prepare(input, { onProgress, signal } = {}) {
      const created = await create(input, { signal });
      console.log(`[torbox] added ${created.kind} ${created.id}; waiting for the file`);
      const item = await fetched(created, { onProgress, signal });
      const file = pickFile(item.files);
      const url = await link(created, file, { signal });
      const filename = baseName(file.short_name || file.name);
      console.log(`[torbox] ${created.kind} ${created.id}: ${filename} ready`);
      return { url, filename, sizeBytes: Number(file.size) || 0 };
    }

    return { create, status, prepare };
  }

  // What the account holds: torrents, web downloads and usenet. Each ready file is one entry the
  // queue can download, so links added on torbox.app from a computer show up on the console.
  var KINDS = {
    torrent: { list: `${TORRENTS}/mylist`, request: `${TORRENTS}/requestdl`, param: "torrent_id" },
    webdl: { list: `${WEB}/mylist`, request: `${WEB}/requestdl`, param: "web_id" },
    usenet: { list: "/v1/api/usenet/mylist", request: "/v1/api/usenet/requestdl", param: "usenet_id" }
  };
  async function requestLink(call, key, { kind, id, file }, signal) {
    const { request, param } = KINDS[kind];
    // As createTorbox's own link(): the call checked against the live API.
    const url = await call(`${request}?token=${encodeURIComponent(key)}&${param}=${id}&file_id=${file}`, { signal });
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("TorBox did not return a download link. Retry.");
    return { url: webURL(url).url, rejectHtml: true };
  }
  var entryName = (name) => baseName(name).replace(/[\x00-\x1f\\]/g, "").slice(-200) || "torbox-file";
  function createTorboxAccount({ http, apiKey }) {
    const keyed = () => {
      const key = apiKey();
      if (!key) throw new Error("Add your TorBox API key first.");
      return key;
    };
    async function list({ signal } = {}) {
      const call = torboxCall({ http, key: keyed() });
      const entries = [];
      for (const kind of Object.keys(KINDS)) {
        let items;
        try {
          items = await call(`${KINDS[kind].list}?bypass_cache=true`, { signal });
        } catch (error2) {
          if (error2 instanceof TorboxRefused) continue;
          throw error2;
        }
        for (const item of Array.isArray(items) ? items : []) {
          const done = ready(item);
          const common = { kind, id: item?.id, state: String(item?.download_state || ""), progress: typeof item?.progress === "number" ? item.progress : null, added: Date.parse(item?.created_at || "") || 0 };
          for (const file of item?.files || []) {
            entries.push({ ...common, key: `${kind}-${item.id}-${file.id}`, file: file.id, name: entryName(file.short_name || file.name), item: item.name || "", sizeBytes: Number(file.size) || null, ready: done });
          }
          if (!item?.files?.length) entries.push({ ...common, key: `${kind}-${item?.id}`, file: null, name: entryName(item?.name), item: "", sizeBytes: Number(item?.size) || null, ready: false });
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
    // Hands a link to TorBox, a magnet as a torrent and anything else as a web download, without
    // waiting for it: the account's list shows it, and automatic downloads take it when ready.
    async function add(link) {
      return createTorbox({ http, key: keyed() }).create(link);
    }
    return { add, list, release };
  }

  // The fork's debrid chain: a catalog link goes to TorBox first. TorBox fetches the file onto its own
  // servers (at once when it has it cached) and the console downloads it from TorBox's CDN, so hosts
  // behind a captcha or a wait come down at the connection's speed. What TorBox declines goes to the
  // next service (fallback); a host its list leaves out (supports, debrid-hosts.js) never reaches it.
  function createTorboxResolver({ http, fallback, apiKey, supports = () => true, wait = defaultWait, now = Date.now }) {
    async function resolve2(release, options = {}) {
      const key = apiKey();
      if (release.torbox) {
        if (!key) throw new Error("This download is from TorBox: add your TorBox API key in Settings.");
        return requestLink(torboxCall({ http, key, wait }), key, release.torbox, options.signal);
      }
      const link = release.browserUrl || release.url;
      // A link captured from the console browser is already the final file, tied to that session.
      // `noDebrid` is "Download directly" on the computer page; a host TorBox doesn't list goes on.
      if (!key || options.noDebrid || options.directURL || release.manifestUrl || !link || !supports(link)) return fallback.resolve(release, options);
      try {
        options.onStatus?.(null);
        // createTorbox's own flow as it was checked against the live API: added, waited for (its
        // 30 minutes), then linked.
        const prepared = await createTorbox({ http, key, wait, now }).prepare(webURL(link).url, {
          signal: options.signal,
          onProgress: ({ progress }) => options.onStatus?.(progress)
        });
        return { url: webURL(prepared.url).url, rejectHtml: true, ...prepared.sizeBytes > 0 ? { expectedBytes: prepared.sizeBytes } : {} };
      } catch (error2) {
        if (!(error2 instanceof TorboxRefused) || options.signal?.aborted) throw error2;
        console.log(`[torbox] ${error2.message} Resolving ${release.provider || "the source"} with the next service`);
        return fallback.resolve(release, options);
      }
    }
    return { resolve: resolve2, debrid: () => Boolean(apiKey()) || Boolean(fallback?.debrid?.()) };
  }

export { TorboxRefused, baseName, createTorbox, createTorboxAccount, createTorboxResolver, createdId, pickFile, ready, torboxCall };
