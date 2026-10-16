// ADDED: Overdrive on the computer's browser. The app listens on port 7878 of the local network;
// http://<console address>:7878/ is a page (remote-page.js) where the TorBox key is pasted, a link
// sent to the console's downloads or to TorBox, and the TorBox files downloaded, as in the TorBox
// sheet. Anyone on the same network can open it, as with the console's other network services.

import { getTorboxKey, setTorboxKey } from './debrid.js';
import { downloadQueue } from './downloads.js';
import { PAGE } from './remote-page.js';
import { addToTorbox, listTorbox, queueLink, queueTorboxEntry } from './torbox-queue.js';
import { LocalServer } from '@ps5-react/core';

  var PORT = 7878;
  var server = null;
  var JSON_TYPE = "application/json; charset=utf-8";
  var reply = (status, value) => ({ status, type: JSON_TYPE, body: JSON.stringify(value) });
  var masked = (key) => key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
  function bodyOf(request) {
    if (!request.body) return {};
    try {
      const value = JSON.parse(request.body);
      return value && typeof value === "object" ? value : {};
    } catch {
      throw Object.assign(new Error("The request body is not JSON."), { status: 400 });
    }
  }
  function state() {
    let jobs = [];
    const off = downloadQueue().subscribe((value) => {
      jobs = value;
    });
    off();
    const key = getTorboxKey();
    return {
      torbox: Boolean(key),
      key: key ? masked(key) : null,
      downloads: jobs.map((job2) => ({ title: job2.title, state: job2.state, written: job2.written || 0, total: job2.total || null, error: job2.error || "" }))
    };
  }
  // The files last listed, so a download names one by its key without the page sending its ids.
  var listed = /* @__PURE__ */ new Map();
  async function route(request) {
    const path = request.path.split("?")[0];
    if (request.method === "GET" && (path === "/" || path === "/index.html")) return { type: "text/html; charset=utf-8", body: PAGE };
    if (request.method === "GET" && path === "/api/state") return reply(200, state());
    if (request.method === "GET" && path === "/api/torbox") {
      const files = await listTorbox();
      listed = new Map(files.map((file) => [file.key, file]));
      return reply(200, { files });
    }
    if (request.method !== "POST") return reply(path.startsWith("/api/") ? 405 : 404, { error: "Not found." });
    // A page on another site could post here from the same browser; only this page's own requests,
    // which say they are JSON, are taken.
    if (!/^application\/json\b/i.test(request.contentType)) return reply(415, { error: "Send JSON." });
    const body = bodyOf(request);
    if (path === "/api/key") {
      setTorboxKey(typeof body.key === "string" ? body.key : "");
      return reply(200, { torbox: Boolean(getTorboxKey()) });
    }
    if (path === "/api/download") return reply(200, { name: queueLink(body.link, body.name) });
    if (path === "/api/torbox/add") {
      await addToTorbox(body.link);
      return reply(200, { ok: true });
    }
    if (path === "/api/torbox/download") {
      const file = listed.get(String(body.key || ""));
      if (!file) return reply(404, { error: "That TorBox file is no longer listed. Reload the page." });
      return reply(200, { name: queueTorboxEntry(file) });
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

export { remoteAddress, startRemote };
