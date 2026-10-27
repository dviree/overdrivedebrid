// ADDED: what the TorBox sheet and the computer's browser (remote.js) both do: list the TorBox
// account, hand it a link, put a TorBox file or any link in the download queue, download what
// becomes ready in TorBox by itself, and read source lists in FPKGi's format.

import { getTorboxKey, readSetting, saveSetting } from './debrid.js';
import { webURL } from './download-sources.js';
import { downloadQueue, freeBytes, storageRoots } from './downloads.js';
import { parseSourceList } from './source-lists.js';
import { createTorboxAccount } from './torbox.js';
import { useEffect, useState } from 'react';
import { Http } from '@ps5-react/core';

  var account = createTorboxAccount({ http: Http, apiKey: getTorboxKey });
  var FORMATS = ["pkg", "fpkg", "exfat", "ffpkg", "ffpfs", "ffpfsc", "zip", "rar", "7z"];
  // Downloads that are no catalog game share one entry: the Downloads screen shows them by title.
  var outside = (title) => ({ id: "torbox", titleId: "TORBOX", title });
  // The drive with the most free space; the console's own storage when none is listed.
  function roomiest() {
    const roots = storageRoots();
    return roots.map((root2) => ({ root: root2, free: freeBytes(root2) ?? -1 })).sort((a, b) => b.free - a.free)[0]?.root ?? roots[0];
  }
  function queueTorboxEntry(entry2) {
    downloadQueue().enqueue(outside(entry2.name), account.release(entry2), roomiest());
    return entry2.name;
  }
  var hashOf = (text) => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return hash.toString(16).padStart(8, "0");
  };
  // Any file link, downloaded like a catalog source: through TorBox when its key is set.
  function queueLink(url, name, sizeBytes = null) {
    const { url: link, path } = webURL(String(url || "").trim());
    // The file's own name: hosts put it before a trailing page name (mediafire.com/file/<id>/<name>/file).
    const segments = path.split(/[?#]/)[0].split("/").filter(Boolean);
    const last = [...segments].reverse().find((segment) => /\.[a-z0-9]{1,8}$/i.test(segment)) || segments.at(-1) || "";
    let filename = String(name || "").trim();
    if (!filename) {
      try {
        filename = decodeURIComponent(last);
      } catch {
        filename = last;
      }
    }
    filename = filename.replace(/[\x00-\x1f/\\]/g, "").slice(-200) || `download-${hashOf(link)}`;
    const ext = /\.([a-z0-9]{1,8})$/i.exec(filename)?.[1]?.toLowerCase();
    const release = {
      id: `link-${hashOf(link)}`,
      filename,
      format: ext && FORMATS.includes(ext) ? ext : "binary",
      url: link,
      provider: webURL(link).host.replace(/^www\./, ""),
      label: filename,
      sizeBytes: Number(sizeBytes) > 0 ? Number(sizeBytes) : null
    };
    downloadQueue().enqueue(outside(filename), release, roomiest());
    return filename;
  }
  var listTorbox = () => account.list();
  var addToTorbox = (link) => account.add(link);

  // Automatic downloads (as rdt-client does): while the app runs, what becomes ready in TorBox, added
  // from a computer on torbox.app or the computer page, is put in the queue by itself. Only what
  // appears after it is turned on: what the account already held is marked as seen then. Game files
  // and archives only, not the .nfo and sample files beside them.
  var AUTO_EVERY_MS = 60e3;
  var MIN_AUTO_BYTES = 1024 * 1024;
  var autoListeners = /* @__PURE__ */ new Set();
  var autoTimer = null;
  var autoBusy = false;
  var seen = new Set(readSetting("torboxSeen", []).filter((key) => typeof key === "string"));
  var autoDownload = () => readSetting("torboxAuto", false) === true;
  var wanted = (entry2) => {
    const ext = /\.([a-z0-9]{1,8})$/i.exec(entry2.name)?.[1]?.toLowerCase();
    return Boolean(ext && FORMATS.includes(ext)) && !(entry2.sizeBytes && entry2.sizeBytes < MIN_AUTO_BYTES);
  };
  function remember(keys2) {
    for (const key of keys2) seen.add(key);
    saveSetting("torboxSeen", [...seen].slice(-500));
  }
  async function autoPass() {
    if (autoBusy || !autoDownload() || !getTorboxKey()) return;
    autoBusy = true;
    try {
      const entries = await account.list();
      const fresh = entries.filter((entry2) => entry2.ready && entry2.file != null && !seen.has(entry2.key));
      for (const entry2 of fresh.filter(wanted)) {
        try {
          queueTorboxEntry(entry2);
          console.log(`[torbox] queued ${entry2.name} by itself`);
        } catch (error2) {
          console.log(`[torbox] ${entry2.name} not queued: ${error2.message}`);
        }
      }
      if (fresh.length) remember(fresh.map((entry2) => entry2.key));
    } catch (error2) {
      console.log(`[torbox] automatic check failed: ${error2.message}`);
    } finally {
      autoBusy = false;
    }
  }
  function startAutoDownload() {
    if (autoTimer === null) autoTimer = setInterval(() => void autoPass(), AUTO_EVERY_MS);
    void autoPass();
  }
  async function setAutoDownload(on) {
    if (on && !autoDownload() && getTorboxKey()) {
      try {
        remember((await account.list()).map((entry2) => entry2.key));
      } catch (error2) {
        console.log(`[torbox] existing files not listed: ${error2.message}`);
      }
    }
    saveSetting("torboxAuto", Boolean(on));
    for (const listener of autoListeners) listener(Boolean(on));
  }
  function useAutoDownload() {
    const [on, setOn] = (0, useState)(autoDownload());
    (0, useEffect)(() => {
      autoListeners.add(setOn);
      return () => {
        autoListeners.delete(setOn);
      };
    }, []);
    return on;
  }

  // Source lists in FPKGi's format (as FPKGi reads them): a JSON object whose "DATA" maps each file's
  // download link to {name, size, region, version, release, min_fw, cover_url}. Their links are kept
  // in settings; each list is fetched when the computer page asks for it.
  var MAX_LISTS = 16;
  var sourceLists = () => readSetting("sourceLists", []).filter((url) => typeof url === "string");
  function addSourceList(url) {
    const link = webURL(String(url || "").trim()).url;
    const lists = sourceLists().filter((item) => item !== link);
    if (lists.length >= MAX_LISTS) throw new Error(`At most ${MAX_LISTS} source lists.`);
    saveSetting("sourceLists", [...lists, link]);
  }
  var removeSourceList = (url) => saveSetting("sourceLists", sourceLists().filter((item) => item !== url));
  async function readSourceList(url) {
    const response = await Http.request(url, { maxBytes: 4 * 1024 * 1024 });
    if (!response.ok) throw new Error(`The list answered HTTP ${response.status}.`);
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error("The list is not JSON.");
    }
    return parseSourceList(value);
  }

export { addSourceList, addToTorbox, listTorbox, queueLink, queueTorboxEntry, readSourceList, removeSourceList, roomiest, setAutoDownload, sourceLists, startAutoDownload, useAutoDownload };
