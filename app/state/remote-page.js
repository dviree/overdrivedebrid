// ADDED: the page a computer's browser gets from the console (remote.js). Plain HTML and script,
// no external files: the console serves it as it is. Its script talks to /api/* on the same address.

  var PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Overdrive</title>
<style>
  :root { color-scheme: dark; --bg: #0b0b0d; --card: #17171a; --line: #2a2a2f; --fg: #f2f2f3; --muted: #a3a3ab; --accent: #f2f2f3; --bad: #ff8a80; --good: #9ee6a8; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.5px; }
  h2 { font-size: 18px; margin: 0 0 12px; }
  p.lead { color: var(--muted); margin: 0 0 24px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  form { display: flex; gap: 8px; flex-wrap: wrap; }
  input { flex: 1 1 260px; min-width: 0; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font: inherit; }
  button { background: var(--accent); color: #0d0d0f; border: 0; border-radius: 10px; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); }
  button:disabled { opacity: .5; cursor: default; }
  .hint { color: var(--muted); font-size: 14px; margin: 8px 0 0; }
  .status { min-height: 1.5em; margin: 8px 0 0; font-size: 14px; }
  .status.bad { color: var(--bad); } .status.good { color: var(--good); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
  li:first-child { border-top: 0; }
  .grow { flex: 1; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 14px; }
  .bar { height: 4px; background: var(--line); border-radius: 2px; margin-top: 6px; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: var(--fg); }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Overdrive</h1>
  <p class="lead">Control the downloads on your PS5 from this computer.</p>

  <section>
    <h2>TorBox API key</h2>
    <form id="key-form">
      <input id="key" name="key" autocomplete="off" spellcheck="false" placeholder="Paste the key from torbox.app/settings">
      <button>Save</button>
      <button type="button" class="ghost" id="key-clear">Turn off</button>
    </form>
    <p class="hint" id="key-state">Loading…</p>
    <p class="status" id="key-status"></p>
  </section>

  <section>
    <h2>Download a link</h2>
    <form id="link-form">
      <input id="link" name="link" autocomplete="off" spellcheck="false" placeholder="https://… or magnet:?…">
      <button>Download to PS5</button>
      <button type="button" class="ghost" id="link-torbox">Add to TorBox only</button>
    </form>
    <p class="hint">A file link downloads straight to the console, through TorBox when the key is set. A magnet link goes to TorBox; once it is ready, download it from the list below.</p>
    <p class="status" id="link-status"></p>
  </section>

  <section>
    <h2>Your TorBox</h2>
    <ul id="torbox"><li class="empty">Loading…</li></ul>
    <p class="status" id="torbox-status"></p>
  </section>

  <section>
    <h2>Downloads on the PS5</h2>
    <ul id="queue"><li class="empty">Loading…</li></ul>
  </section>
</main>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function api(path, body) {
    return fetch("/api/" + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { if (!r.ok) throw new Error(data.error || ("HTTP " + r.status)); return data; }); });
  }
  function say(id, text, good) { var el = $(id); el.textContent = text || ""; el.className = "status " + (text ? (good ? "good" : "bad") : ""); }
  function size(bytes) { if (bytes == null) return ""; var gb = bytes / 1e9; return gb >= 1 ? gb.toFixed(1) + " GB" : Math.round(bytes / 1e6) + " MB"; }
  function row(name, meta, fraction, action) {
    var li = document.createElement("li"), text = document.createElement("div"), n = document.createElement("div"), m = document.createElement("div");
    text.className = "grow"; n.className = "name"; m.className = "meta";
    n.textContent = name; n.title = name; m.textContent = meta;
    text.appendChild(n); text.appendChild(m);
    if (fraction != null) { var bar = document.createElement("div"), fill = document.createElement("span"); bar.className = "bar"; fill.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + "%"; bar.appendChild(fill); text.appendChild(bar); }
    li.appendChild(text);
    if (action) li.appendChild(action);
    return li;
  }
  function fill(list, items, empty) {
    list.textContent = "";
    if (!items.length) { var li = document.createElement("li"); li.className = "empty"; li.textContent = empty; list.appendChild(li); }
    items.forEach(function (item) { list.appendChild(item); });
  }
  var KINDS = { torrent: "Torrent", webdl: "Link", usenet: "Usenet" };
  var hasKey = false;
  function refreshState() {
    return api("state").then(function (state) {
      hasKey = state.torbox;
      $("key-state").textContent = state.torbox ? "On (" + state.key + "): every download goes through TorBox." : "Off: downloads go straight to the hosts.";
      fill($("queue"), state.downloads.map(function (job) {
        var fraction = job.total ? job.written / job.total : null;
        return row(job.title, [job.state, job.total ? size(job.written || 0) + " of " + size(job.total) : "", job.error].filter(Boolean).join(" · "), fraction);
      }), "Nothing in the queue.");
    }).catch(function (error) { $("key-state").textContent = "The console did not answer: " + error.message; });
  }
  function refreshTorbox() {
    if (!hasKey) { fill($("torbox"), [], "Save your TorBox API key to see your files here."); return Promise.resolve(); }
    return api("torbox").then(function (data) {
      fill($("torbox"), data.files.map(function (file) {
        var button = null;
        if (file.ready) {
          button = document.createElement("button");
          button.textContent = "Download to PS5";
          button.onclick = function () {
            button.disabled = true;
            api("torbox/download", { key: file.key }).then(function (r) { say("torbox-status", "Added to the PS5's downloads: " + r.name, true); refreshState(); })
              .catch(function (e) { say("torbox-status", e.message); }).then(function () { button.disabled = false; });
          };
        }
        var state = file.ready ? "Ready" : (file.progress != null ? "TorBox " + Math.round(file.progress * 100) + "%" : (file.state || "Not ready"));
        return row(file.name, [file.sizeBytes ? size(file.sizeBytes) : "", KINDS[file.kind] || file.kind, state].filter(Boolean).join(" · "), file.ready ? null : file.progress, button);
      }), "Nothing in your TorBox yet.");
    }).catch(function (e) { say("torbox-status", e.message); });
  }
  $("key-form").onsubmit = function (event) {
    event.preventDefault();
    api("key", { key: $("key").value }).then(function () { $("key").value = ""; say("key-status", "Saved.", true); return refreshState().then(refreshTorbox); })
      .catch(function (e) { say("key-status", e.message); });
  };
  $("key-clear").onclick = function () {
    api("key", { key: "" }).then(function () { say("key-status", "TorBox is off.", true); return refreshState().then(refreshTorbox); })
      .catch(function (e) { say("key-status", e.message); });
  };
  function send(path, done) {
    var link = $("link").value.trim();
    if (!link) return;
    api(path, { link: link }).then(function (r) { $("link").value = ""; say("link-status", done(r), true); refreshState(); setTimeout(refreshTorbox, 1500); })
      .catch(function (e) { say("link-status", e.message); });
  }
  $("link-form").onsubmit = function (event) {
    event.preventDefault();
    if (/^magnet:/i.test($("link").value.trim())) send("torbox/add", function () { return "Sent to TorBox. Download it below when it is ready."; });
    else send("download", function (r) { return "Added to the PS5's downloads: " + r.name; });
  };
  $("link-torbox").onclick = function () { send("torbox/add", function () { return "Sent to TorBox."; }); };
  refreshState().then(refreshTorbox);
  setInterval(refreshState, 3000);
  setInterval(refreshTorbox, 15000);
})();
</script>
</body>
</html>
`;

export { PAGE };
