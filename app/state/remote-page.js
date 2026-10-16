// ADDED: the page a computer's browser gets from the console (remote.js). Plain HTML and script,
// no external files: the console serves it as it is. Its script talks to /api/* on the same address,
// with the token it got by pairing (kept in the browser's localStorage).

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
  h3 { font-size: 15px; margin: 14px 0 8px; color: var(--muted); font-weight: 600; }
  p.lead { color: var(--muted); margin: 0 0 24px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  form { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  input[type=text], input:not([type]) { flex: 1 1 240px; min-width: 0; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font: inherit; }
  input.code { flex: 0 1 220px; font-size: 24px; letter-spacing: 6px; text-align: center; }
  button { background: var(--accent); color: #0d0d0f; border: 0; border-radius: 10px; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); }
  button.small { padding: 6px 10px; font-size: 14px; }
  button:disabled { opacity: .5; cursor: default; }
  label.toggle { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; margin-top: 10px; }
  label.toggle input { margin-top: 5px; }
  .hint { color: var(--muted); font-size: 14px; margin: 4px 0 0; }
  .status { min-height: 1.5em; margin: 8px 0 0; font-size: 14px; }
  .status.bad { color: var(--bad); } .status.good { color: var(--good); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
  li:first-child { border-top: 0; }
  .grow { flex: 1 1 260px; min-width: 0; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 14px; }
  .bar { height: 4px; background: var(--line); border-radius: 2px; margin-top: 6px; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: var(--fg); }
  .empty { color: var(--muted); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <h1>Overdrive</h1>
  <p class="lead">Control the downloads on your PS5 from this computer.</p>

  <section id="pairing" hidden>
    <h2>Pair this browser</h2>
    <p class="hint">Enter the code on your PS5: Settings → Debrid, or the notification that just appeared on the console.</p>
    <form id="pair-form">
      <input class="code" id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
      <button>Pair</button>
    </form>
    <p class="status" id="pair-status"></p>
  </section>

  <div id="app" hidden>
    <section>
      <h2>Debrid accounts</h2>
      <h3>TorBox</h3>
      <form data-service="torbox">
        <input autocomplete="off" spellcheck="false" placeholder="API key from torbox.app/settings">
        <button>Save</button>
        <button type="button" class="ghost" data-clear>Remove</button>
      </form>
      <p class="hint" data-state="torbox"></p>
      <h3>Premiumize</h3>
      <form data-service="premiumize">
        <input autocomplete="off" spellcheck="false" placeholder="API key from premiumize.me/account">
        <button>Save</button>
        <button type="button" class="ghost" data-clear>Remove</button>
      </form>
      <p class="hint" data-state="premiumize"></p>
      <label class="toggle"><input type="checkbox" id="auto"><span>Download what becomes ready in TorBox by itself<br><span class="hint">Add a link, magnet or NZB on torbox.app or below; the PS5 downloads it when TorBox has it, while Overdrive is open.</span></span></label>
      <p class="status" id="key-status"></p>
    </section>

    <section>
      <h2>Download a link</h2>
      <form id="link-form">
        <input id="link" autocomplete="off" spellcheck="false" placeholder="https://… or magnet:?…">
        <button>Download to PS5</button>
        <button type="button" class="ghost" id="link-torbox">Add to TorBox only</button>
      </form>
      <p class="hint">A file link downloads straight to the console, through TorBox or Premiumize when a key is set. A magnet link goes to TorBox; once it is ready, download it from the list below.</p>
      <p class="status" id="link-status"></p>
    </section>

    <section>
      <h2>Downloads on the PS5</h2>
      <ul id="queue"><li class="empty">Loading…</li></ul>
      <p class="status" id="queue-status"></p>
    </section>

    <section>
      <h2>Your TorBox</h2>
      <ul id="torbox"><li class="empty">Loading…</li></ul>
      <p class="status" id="torbox-status"></p>
    </section>

    <section>
      <h2>Source lists</h2>
      <form id="list-form">
        <input id="list-url" autocomplete="off" spellcheck="false" placeholder="https://… link to a list in FPKGi's JSON format">
        <button>Add list</button>
      </form>
      <p class="hint">A list is JSON with a "DATA" object that maps each file's link to its name and size, as FPKGi reads it.</p>
      <ul id="lists"></ul>
      <ul id="entries"></ul>
      <p class="status" id="list-status"></p>
    </section>
  </div>
</main>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var token = "";
  try { token = localStorage.getItem("overdrive-token") || ""; } catch (e) {}
  function api(path, body) {
    var url = "/api/" + path + (path.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token);
    return fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && data.pair) { showPairing(); throw new Error(data.error); }
        if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
        return data;
      }); });
  }
  function say(id, text, good) { var el = $(id); el.textContent = text || ""; el.className = "status " + (text ? (good ? "good" : "bad") : ""); }
  function size(bytes) { if (bytes == null) return ""; var gb = bytes / 1e9; return gb >= 1 ? gb.toFixed(1) + " GB" : Math.round(bytes / 1e6) + " MB"; }
  function speed(bps) { return bps >= 1048576 ? (bps / 1048576).toFixed(1) + " MB/s" : Math.round(bps / 1024) + " KB/s"; }
  function eta(seconds) { if (!isFinite(seconds) || seconds <= 0) return ""; var h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60); return (h ? h + " h " : "") + m + " min left"; }
  function button(label, onclick, ghost) { var b = document.createElement("button"); b.textContent = label; b.className = "small" + (ghost ? " ghost" : ""); b.onclick = onclick; return b; }
  function row(name, meta, fraction, actions) {
    var li = document.createElement("li"), text = document.createElement("div"), n = document.createElement("div"), m = document.createElement("div");
    text.className = "grow"; n.className = "name"; m.className = "meta";
    n.textContent = name; n.title = name; m.textContent = meta;
    text.appendChild(n); text.appendChild(m);
    if (fraction != null) { var bar = document.createElement("div"), fill = document.createElement("span"); bar.className = "bar"; fill.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + "%"; bar.appendChild(fill); text.appendChild(bar); }
    li.appendChild(text);
    if (actions && actions.length) { var box = document.createElement("div"); box.className = "actions"; actions.forEach(function (a) { box.appendChild(a); }); li.appendChild(box); }
    return li;
  }
  function fill(list, items, empty) {
    list.textContent = "";
    if (!items.length && empty) { var li = document.createElement("li"); li.className = "empty"; li.textContent = empty; list.appendChild(li); }
    items.forEach(function (item) { list.appendChild(item); });
  }
  function showPairing() { $("pairing").hidden = false; $("app").hidden = true; $("code").focus(); }
  function showApp() { $("pairing").hidden = true; $("app").hidden = false; }

  var hasTorbox = false;
  var BUSY = ["queued", "resolving", "connecting", "downloading", "verifying", "extracting", "installing"];
  function queueAction(id, action) {
    api("queue", { id: id, action: action }).then(render).catch(function (e) { say("queue-status", e.message); });
  }
  function render(state) {
    showApp();
    hasTorbox = Boolean(state.keys.torbox);
    ["torbox", "premiumize"].forEach(function (service) {
      document.querySelector('[data-state="' + service + '"]').textContent = state.keys[service] ? "On (" + state.keys[service] + ")" : "Not set";
    });
    $("auto").checked = state.auto;
    $("auto").disabled = !hasTorbox;
    var downloads = state.downloads;
    fill($("queue"), downloads.map(function (job, i) {
      var fraction = job.total ? job.written / job.total : null;
      var running = job.state === "downloading" && job.bytesPerSecond > 0;
      var meta = [job.state, job.total ? size(job.written || 0) + " of " + size(job.total) : "", running ? speed(job.bytesPerSecond) : "",
        running && job.total ? eta((job.total - job.written) / job.bytesPerSecond) : "", job.error].filter(Boolean).join(" · ");
      var actions = [];
      if (BUSY.indexOf(job.state) >= 0) actions.push(button("Pause", function () { queueAction(job.id, "pause"); }, true));
      if (job.state === "paused" || job.state === "failed") actions.push(button("Resume", function () { queueAction(job.id, "resume"); }));
      if (i > 0) actions.push(button("↑", function () { queueAction(job.id, "up"); }, true));
      if (i < downloads.length - 1) actions.push(button("↓", function () { queueAction(job.id, "down"); }, true));
      actions.push(button("Remove", function () { if (confirm("Remove " + job.title + " from the queue?")) queueAction(job.id, "remove"); }, true));
      return row(job.title, meta, fraction, actions);
    }), "Nothing in the queue.");
  }
  function refreshState() { return api("state").then(render).catch(function () {}); }
  function refreshTorbox() {
    if (!hasTorbox) { fill($("torbox"), [], "Save a TorBox API key to see your files here."); return Promise.resolve(); }
    return api("torbox").then(function (data) {
      var KINDS = { torrent: "Torrent", webdl: "Link", usenet: "Usenet" };
      fill($("torbox"), data.files.map(function (file) {
        var actions = file.ready ? [button("Download to PS5", function () {
          api("torbox/download", { key: file.key }).then(function (r) { say("torbox-status", "Added to the PS5's downloads: " + r.name, true); refreshState(); })
            .catch(function (e) { say("torbox-status", e.message); });
        })] : [];
        var state = file.ready ? "Ready" : (file.progress != null ? "TorBox " + Math.round(file.progress * 100) + "%" : (file.state || "Not ready"));
        return row(file.name, [file.sizeBytes ? size(file.sizeBytes) : "", KINDS[file.kind] || file.kind, state].filter(Boolean).join(" · "), file.ready ? null : file.progress, actions);
      }), "Nothing in your TorBox yet.");
    }).catch(function (e) { say("torbox-status", e.message); });
  }
  function refreshLists() {
    return api("lists").then(function (data) {
      fill($("lists"), data.lists.map(function (url) {
        return row(url, "", null, [button("Open", function () { openList(url); }), button("Remove", function () {
          api("lists/remove", { url: url }).then(function () { fill($("entries"), []); refreshLists(); }).catch(function (e) { say("list-status", e.message); });
        }, true)]);
      }), "");
    }).catch(function () {});
  }
  function openList(url) {
    say("list-status", "Loading the list…", true);
    api("lists/read?url=" + encodeURIComponent(url)).then(function (data) {
      say("list-status", data.entries.length + " files in the list.", true);
      fill($("entries"), data.entries.map(function (entry, index) {
        return row(entry.name, [size(entry.sizeBytes), entry.region, entry.version ? "v" + entry.version : "", entry.minFirmware ? "FW " + entry.minFirmware + "+" : ""].filter(Boolean).join(" · "), null,
          [button("Download to PS5", function () {
            api("lists/download", { url: url, index: index }).then(function (r) { say("list-status", "Added to the PS5's downloads: " + r.name, true); refreshState(); })
              .catch(function (e) { say("list-status", e.message); });
          })]);
      }), "The list is empty.");
    }).catch(function (e) { say("list-status", e.message); });
  }

  $("pair-form").onsubmit = function (event) {
    event.preventDefault();
    api("pair", { code: $("code").value }).then(function (r) {
      token = r.token;
      try { localStorage.setItem("overdrive-token", token); } catch (e) {}
      $("code").value = ""; say("pair-status", "");
      start();
    }).catch(function (e) { say("pair-status", e.message); });
  };
  Array.prototype.forEach.call(document.querySelectorAll("form[data-service]"), function (form) {
    var service = form.getAttribute("data-service"), input = form.querySelector("input");
    function save(key, done) {
      api("key", { service: service, key: key }).then(function (state) { input.value = ""; render(state); say("key-status", done, true); refreshTorbox(); })
        .catch(function (e) { say("key-status", e.message); });
    }
    form.onsubmit = function (event) { event.preventDefault(); save(input.value.trim(), "Saved."); };
    form.querySelector("[data-clear]").onclick = function () { save("", "Removed."); };
  });
  $("auto").onchange = function () {
    api("auto", { on: $("auto").checked }).then(function (state) { render(state); say("key-status", state.auto ? "New TorBox files will download by themselves." : "Automatic downloads are off.", true); })
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
  $("list-form").onsubmit = function (event) {
    event.preventDefault();
    api("lists/add", { url: $("list-url").value.trim() }).then(function () { $("list-url").value = ""; refreshLists(); })
      .catch(function (e) { say("list-status", e.message); });
  };
  var timers = [];
  function start() {
    timers.forEach(clearInterval);
    api("state").then(function (state) {
      render(state);
      refreshTorbox(); refreshLists();
      timers = [setInterval(refreshState, 2000), setInterval(refreshTorbox, 15000)];
    }).catch(function () {});
  }
  // Without a token the first call is refused and the console shows its code as a notification.
  start();
})();
</script>
</body>
</html>
`;

export { PAGE };
