// ADDED: Overdrive on the computer's browser. The app listens on port 7878 of the local network;
// http://<console address>:7878/ is a page (remote-page.js) where the debrid keys are pasted, a link
// sent to the console's downloads or to TorBox, the TorBox files and source lists downloaded and the
// queue controlled (pause, resume, remove, order), with speed and time left.
// A browser pairs first, as Orbit's phone control does: it sends the six-digit code the console shows
// (Settings → Debrid, and a notification when a browser asks) and gets a token it sends with every
// call after. Five wrong codes make a new one.

import { SERVICES, anyDebrid, getDebridKey, readSetting, saveSetting, setDebridKey } from './debrid.js';
import { downloadQueue } from './downloads.js';
import { PAGE } from './remote-page.js';
import { addSourceList, addToTorbox, listTorbox, queueLink, queueTorboxEntry, readSourceList, removeSourceList, setAutoDownload, sourceLists } from './torbox-queue.js';
import { LocalServer, Notifications } from '@ps5-react/core';

  var PORT = 7878;
  var server = null;
  var JSON_TYPE = "application/json; charset=utf-8";
  var reply = (status, value) => ({ status, type: JSON_TYPE, body: JSON.stringify(value) });
  var masked = (key) => key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
  var failure = (status, message) => Object.assign(new Error(message), { status });

  // Pairing. QuickJS has no crypto source, so the code and tokens mix Math.random with the clock:
  // enough against guessing on a home network, where five misses also replace the code.
  var MAX_TOKENS = 8;
  var randomDigits = (count) => Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
  var randomToken = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 2 ** 32).toString(16).padStart(8, "0")).join("") + Date.now().toString(16);
  var code = randomDigits(6);
  var misses = 0;
  var noticeAt = 0;
  var codeListeners = /* @__PURE__ */ new Set();
  var tokens = () => readSetting("remoteTokens", []).filter((token) => typeof token === "string");
  var pairingCode = () => code;
  function newCode() {
    code = randomDigits(6);
    misses = 0;
    for (const listener of codeListeners) listener(code);
  }
  function onCodeChange(listener) {
    codeListeners.add(listener);
    return () => codeListeners.delete(listener);
  }
  var pairedCount = () => tokens().length;
  function forgetPaired() {
    saveSetting("remoteTokens", []);
    newCode();
  }
  function showCode() {
    if (Date.now() - noticeAt < 30e3) return;
    noticeAt = Date.now();
    try {
      Notifications.show("Overdrive pairing code", code);
    } catch (error2) {
      console.log(`[remote] code not shown: ${error2.message}`);
    }
  }
  function pair(body) {
    const given = String(body.code ?? "").replace(/\D/g, "");
    if (!given) {
      showCode();
      throw failure(400, "Enter the code shown on the PS5.");
    }
    if (given !== code) {
      if (++misses >= 5) newCode();
      showCode();
      throw failure(403, "That code is wrong. Check the code on the PS5 and try again.");
    }
    const token = randomToken();
    saveSetting("remoteTokens", [...tokens(), token].slice(-MAX_TOKENS));
    newCode();
    return { token };
  }
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
      auto: readSetting("torboxAuto", false) === true,
      downloads: jobs().map((job2) => ({
        id: job2.id,
        title: job2.title,
        state: job2.state,
        written: job2.written || 0,
        total: job2.total || null,
        bytesPerSecond: job2.bytesPerSecond || 0,
        error: job2.error || ""
      }))
    };
  }
  var QUEUE_ACTIONS = {
    pause: (queue, id) => queue.pause(id),
    resume: (queue, id) => queue.resume(id),
    remove: (queue, id) => queue.remove(id),
    up: (queue, id) => queue.move(id, -1),
    down: (queue, id) => queue.move(id, 1)
  };
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
    if (request.method === "POST" && path === "/api/pair") return reply(200, pair(bodyOf(request)));
    const token = tokenOf(request.path);
    if (!token || !tokens().includes(token)) {
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
      if (path === "/api/lists/read") {
        const url = queryOf(request.path, "url");
        if (!sourceLists().includes(url)) throw failure(404, "That list was removed. Reload the page.");
        const entries = await readSourceList(url);
        lists.set(url, entries);
        return reply(200, { entries });
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

export { forgetPaired, onCodeChange, pairedCount, pairingCode, remoteAddress, startRemote };
