// ADDED: Overdrive on the computer's browser. The app listens on port 7878 of the local network;
// http://<console address>:7878/ is a page (remote-page.js) where the debrid keys are pasted, a link
// sent to the console's downloads or to TorBox, the TorBox files and source lists downloaded and the
// queue controlled (pause, resume, remove, order), with speed and time left.
// A browser pairs first, as Orbit's phone control does: it sends the six-digit code the console shows
// (Settings → Debrid, and a notification when a browser asks), or scans the QR code there, and gets a
// token it sends with every call after. The page also shows which debrid accounts take each source,
// starts a failed download again straight from the host, and manages the downloads and homebrew
// folders.

import { SERVICES, anyDebrid, getDebridKey, readSetting, saveSetting, setDebridKey } from './debrid.js';
import { accountsFor, hostCount } from './debrid-hosts.js';
import { downloadQueue, storageRoots } from './downloads.js';
import { PAGE } from './remote-page.js';
import { sha256 } from './sha256.js';
import { addSourceList, addToTorbox, listTorbox, queueLink, queueTorboxEntry, readSourceList, removeSourceList, setAutoDownload, sourceLists } from './torbox-queue.js';
import { FileSystem, LocalServer, Notifications } from '@ps5-react/core';

  var PORT = 7878;
  var server = null;
  var JSON_TYPE = "application/json; charset=utf-8";
  var reply = (status, value) => ({ status, type: JSON_TYPE, body: JSON.stringify(value) });
  var masked = (key) => key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
  var failure = (status, message) => Object.assign(new Error(message), { status });

  // Pairing, as PS5 Library does it. QuickJS has no crypto source, so the code and tokens mix
  // Math.random with the clock: enough against guessing on a home network, where a code lasts five
  // minutes, is used once and five misses replace it. Only a SHA-256 of each browser's token is
  // kept, with the browser's name, address and when it paired, so each one can be removed alone.
  var MAX_DEVICES = 8;
  var CODE_MS = 5 * 60 * 1e3;
  var randomDigits = (count) => Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
  var randomToken = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 2 ** 32).toString(16).padStart(8, "0")).join("") + Date.now().toString(16);
  var code = randomDigits(6);
  var codeAt = Date.now();
  var misses = 0;
  var noticeAt = 0;
  var codeListeners = /* @__PURE__ */ new Set();
  function storedDevices() {
    const devices = readSetting("remoteDevices", null);
    if (Array.isArray(devices)) return devices.filter((device) => typeof device?.hash === "string");
    // Tokens an older build kept as they were become hashes, so browsers paired then stay paired.
    const old = readSetting("remoteTokens", []).filter((token) => typeof token === "string");
    const moved = old.map((token) => ({ hash: sha256(token), name: "Browser", address: "", at: Date.now() }));
    saveDevices(moved);
    if (old.length) saveSetting("remoteTokens", []);
    return moved;
  }
  function saveDevices(devices) {
    saveSetting("remoteDevices", devices.slice(-MAX_DEVICES));
  }
  var announce = () => {
    for (const listener of codeListeners) listener(code);
  };
  function newCode() {
    code = randomDigits(6);
    codeAt = Date.now();
    misses = 0;
    announce();
  }
  function pairingCode() {
    if (Date.now() - codeAt > CODE_MS) newCode();
    return code;
  }
  // How long the code has left, in seconds, for the console's sheet.
  var codeSecondsLeft = () => Math.max(0, Math.ceil((codeAt + CODE_MS - Date.now()) / 1e3));
  function onCodeChange(listener) {
    codeListeners.add(listener);
    return () => codeListeners.delete(listener);
  }
  var deviceId = (device) => device.hash.slice(0, 12);
  var pairedDevices = () => storedDevices().map((device) => ({ id: deviceId(device), name: device.name || "Browser", address: device.address || "", at: device.at || 0 }));
  var pairedCount = () => storedDevices().length;
  function forgetPaired() {
    saveDevices([]);
    newCode();
  }
  function forgetDevice(id) {
    saveDevices(storedDevices().filter((device) => deviceId(device) !== id));
    announce();
  }
  function showCode() {
    if (Date.now() - noticeAt < 30e3) return;
    noticeAt = Date.now();
    try {
      Notifications.show("Overdrive pairing code", pairingCode());
    } catch (error2) {
      console.log(`[remote] code not shown: ${error2.message}`);
    }
  }
  // A short name for the browser, from what it says it is.
  function browserName(agent) {
    const text = String(agent || "");
    const browser = /Edg\//.test(text) ? "Edge" : /OPR\//.test(text) ? "Opera" : /Firefox\//.test(text) ? "Firefox" : /Chrome\//.test(text) ? "Chrome" : /Safari\//.test(text) ? "Safari" : "Browser";
    const system = /iPhone|iPad/.test(text) ? "iOS" : /Android/.test(text) ? "Android" : /Windows/.test(text) ? "Windows" : /Mac OS X/.test(text) ? "macOS" : /Linux/.test(text) ? "Linux" : "";
    return system ? `${browser} on ${system}` : browser;
  }
  function pair(body, request) {
    const given = String(body.code ?? "").replace(/\D/g, "");
    if (!given) {
      showCode();
      throw failure(400, "Enter the code shown on the PS5.");
    }
    if (given !== pairingCode()) {
      if (++misses >= 5) newCode();
      showCode();
      throw failure(403, "That code is wrong or has expired. Check the code on the PS5 and try again.");
    }
    const token = randomToken();
    saveDevices([...storedDevices(), { hash: sha256(token), name: browserName(body.agent).slice(0, 40), address: String(request.address || ""), at: Date.now() }]);
    newCode();
    return { token };
  }
  var paired = (token) => {
    const hash = sha256(token);
    return storedDevices().some((device) => device.hash === hash);
  };
  var tokenOf = (path) => /[?&]token=([0-9a-f]{16,64})\b/.exec(path)?.[1] ?? "";
  var queryOf = (path, name) => {
    const found = new RegExp(`[?&]${name}=([^&#]*)`).exec(path)?.[1];
    if (found == null) return "";
    try {
      return decodeURIComponent(found.replace(/\+/g, " "));
    } catch {
      return found;
    }
  };

  function bodyOf(request) {
    if (!request.body) return {};
    try {
      const value = JSON.parse(request.body);
      return value && typeof value === "object" ? value : {};
    } catch {
      throw failure(400, "The request body is not JSON.");
    }
  }
  function jobs() {
    let value = [];
    downloadQueue().subscribe((list) => {
      value = list;
    })();
    return value;
  }
  function state() {
    return {
      keys: Object.fromEntries(Object.keys(SERVICES).map((service) => [service, getDebridKey(service) ? masked(getDebridKey(service)) : null])),
      debrid: anyDebrid(),
      hosts: Object.fromEntries(Object.keys(SERVICES).map((service) => [service, hostCount(service)])),
      auto: readSetting("torboxAuto", false) === true,
      downloads: jobs().map((job2) => ({
        id: job2.id,
        title: job2.title,
        state: job2.state,
        written: job2.written || 0,
        total: job2.total || null,
        bytesPerSecond: job2.bytesPerSecond || 0,
        error: job2.error || "",
        direct: job2.noDebrid === true,
        accounts: job2.noDebrid ? [] : accountsFor(job2.release)
      }))
    };
  }
  var QUEUE_ACTIONS = {
    pause: (queue, id) => queue.pause(id),
    resume: (queue, id) => queue.resume(id),
    remove: (queue, id) => queue.remove(id),
    direct: (queue, id) => queue.resumeDirect(id),
    up: (queue, id) => queue.move(id, -1),
    down: (queue, id) => queue.move(id, 1)
  };
  // The file manager: the downloads and homebrew folders of each drive, nothing outside them. A file
  // a download in the queue is still writing stays.
  var FOLDERS = ["downloads", "homebrew"];
  var DONE = ["downloaded", "file-downloaded", "installer-required", "installed", "extraction-required", "extracted", "failed", "paused"];
  var folderRoots = () => storageRoots().flatMap((root2) => FOLDERS.map((folder) => `${root2}/${folder}`));
  function inside(path, { self = false } = {}) {
    const value = String(path || "");
    if (!value.startsWith("/") || /(?:^|\/)\.\.?(?:\/|$)/.test(value) || value.includes("//")) throw failure(400, "That path is not allowed.");
    const clean = value.replace(/\/+$/, "");
    if (!folderRoots().some((root2) => clean.startsWith(`${root2}/`) || self && clean === root2)) throw failure(403, "Only the downloads and homebrew folders can be changed.");
    return clean;
  }
  function busy(path) {
    return jobs().some((job2) => !DONE.includes(job2.state) && [job2.downloadDestination, job2.artifact?.destination, job2.artifact?.directory].some((target) => target && (target === path || target.startsWith(`${path}/`) || path.startsWith(`${target}`))));
  }
  function listFiles(path) {
    if (!path) return { path: "", entries: folderRoots().filter((root2) => FileSystem.exists(root2)).map((root2) => ({ name: root2, path: root2, isDirectory: true, size: 0, modified: 0 })) };
    const folder = inside(path, { self: true });
    const entries = FileSystem.readDir(folder).map((entry2) => ({ name: entry2.name, path: `${folder}/${entry2.name}`, isDirectory: entry2.isDirectory, size: entry2.size || 0, modified: entry2.modified || 0 }));
    entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
    return { path: folder, up: folderRoots().includes(folder) ? "" : folder.slice(0, folder.lastIndexOf("/")), entries };
  }
  async function removeFile(path) {
    const target = inside(path);
    if (busy(target)) throw failure(409, "A download is still writing there. Pause or remove it first.");
    if (!FileSystem.exists(target)) throw failure(404, "That file is gone. Reload the folder.");
    await FileSystem.removeAsync(target);
  }
  function renameFile(path, name) {
    const target = inside(path);
    const value = String(name || "").trim();
    if (!value || value.length > 200 || /[\\/\0]/.test(value) || value === "." || value === "..") throw failure(400, "That name is not allowed.");
    if (busy(target)) throw failure(409, "A download is still writing there. Pause or remove it first.");
    const next = `${target.slice(0, target.lastIndexOf("/"))}/${value}`;
    if (FileSystem.exists(next)) throw failure(409, "Something there already has that name.");
    FileSystem.rename(target, next);
  }
  // What was last listed, so a download names an entry without the page sending its links back.
  var listed = /* @__PURE__ */ new Map();
  var lists = /* @__PURE__ */ new Map();
  async function route(request) {
    const path = request.path.split("?")[0];
    if (request.method === "GET" && (path === "/" || path === "/index.html")) return { type: "text/html; charset=utf-8", body: PAGE };
    if (!path.startsWith("/api/")) return reply(404, { error: "Not found." });
    // A page on another site could post here from the same browser; only this page's own requests,
    // which say they are JSON, are taken.
    if (request.method === "POST" && !/^application\/json\b/i.test(request.contentType)) return reply(415, { error: "Send JSON." });
    if (request.method === "POST" && path === "/api/pair") return reply(200, pair(bodyOf(request), request));
    const token = tokenOf(request.path);
    if (!token || !paired(token)) {
      showCode();
      return reply(401, { error: "Pair this browser first.", pair: true });
    }
    if (request.method === "GET") {
      if (path === "/api/state") return reply(200, state());
      if (path === "/api/torbox") {
        const files = await listTorbox();
        listed = new Map(files.map((file) => [file.key, file]));
        return reply(200, { files });
      }
      if (path === "/api/lists") return reply(200, { lists: sourceLists() });
      if (path === "/api/devices") return reply(200, { devices: pairedDevices(), you: sha256(token).slice(0, 12) });
      if (path === "/api/files") return reply(200, listFiles(queryOf(request.path, "path")));
      if (path === "/api/lists/read") {
        const url = queryOf(request.path, "url");
        if (!sourceLists().includes(url)) throw failure(404, "That list was removed. Reload the page.");
        const entries = await readSourceList(url);
        lists.set(url, entries);
        return reply(200, { entries: entries.map((entry2) => ({ ...entry2, accounts: accountsFor({ url: entry2.url }) })) });
      }
      return reply(404, { error: "Not found." });
    }
    if (request.method !== "POST") return reply(405, { error: "Not allowed." });
    const body = bodyOf(request);
    if (path === "/api/key") {
      setDebridKey(String(body.service || "torbox"), typeof body.key === "string" ? body.key : "");
      return reply(200, state());
    }
    if (path === "/api/auto") {
      await setAutoDownload(body.on === true);
      return reply(200, state());
    }
    if (path === "/api/queue") {
      const act = QUEUE_ACTIONS[body.action];
      if (!act) throw failure(400, "Unknown action.");
      await act(downloadQueue(), String(body.id || ""));
      return reply(200, state());
    }
    if (path === "/api/devices/remove") {
      forgetDevice(String(body.id || ""));
      return reply(200, { devices: pairedDevices() });
    }
    if (path === "/api/files/remove") {
      await removeFile(body.path);
      return reply(200, { ok: true });
    }
    if (path === "/api/files/rename") {
      renameFile(body.path, body.name);
      return reply(200, { ok: true });
    }
    if (path === "/api/download") return reply(200, { name: queueLink(body.link, body.name) });
    if (path === "/api/torbox/add") {
      await addToTorbox(body.link);
      return reply(200, { ok: true });
    }
    if (path === "/api/torbox/download") {
      const file = listed.get(String(body.key || ""));
      if (!file) throw failure(404, "That TorBox file is no longer listed. Reload the page.");
      return reply(200, { name: queueTorboxEntry(file) });
    }
    if (path === "/api/lists/add") {
      addSourceList(body.url);
      return reply(200, { lists: sourceLists() });
    }
    if (path === "/api/lists/remove") {
      removeSourceList(String(body.url || ""));
      lists.delete(String(body.url || ""));
      return reply(200, { lists: sourceLists() });
    }
    if (path === "/api/lists/download") {
      const entry2 = lists.get(String(body.url || ""))?.[Number(body.index)];
      if (!entry2) throw failure(404, "That entry is no longer listed. Reload the list.");
      return reply(200, { name: queueLink(entry2.url, entry2.name, entry2.sizeBytes) });
    }
    return reply(404, { error: "Not found." });
  }
  async function handle(request) {
    try {
      return await route(request);
    } catch (error2) {
      return reply(error2.status || 422, { error: error2.message || String(error2) });
    }
  }
  function startRemote() {
    if (server) return;
    try {
      server = LocalServer.listen({ port: PORT, handler: handle });
      console.log(`[remote] listening on ${LocalServer.address() ?? "?"}:${PORT}`);
    } catch (error2) {
      console.log(`[remote] not started: ${error2.message}`);
    }
  }
  // The page's address with the code in it, for the QR code on the console: opening it pairs.
  function pairingLink() {
    const address = remoteAddress();
    return address ? `${address}/#pair=${pairingCode()}` : null;
  }
  // The address a computer opens, or null while the server is off or the console has no network.
  function remoteAddress() {
    if (!server) return null;
    try {
      const address = LocalServer.address();
      return address ? `http://${address}:${PORT}` : null;
    } catch {
      return null;
    }
  }

export { codeSecondsLeft, forgetDevice, forgetPaired, onCodeChange, pairedCount, pairedDevices, pairingCode, pairingLink, remoteAddress, startRemote };
