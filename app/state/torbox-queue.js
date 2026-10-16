// ADDED: what the TorBox sheet and the computer's browser (remote.js) both do: list the TorBox
// account, hand it a link, and put a TorBox file or any link in the download queue.

import { getTorboxKey } from './debrid.js';
import { webURL } from './download-sources.js';
import { downloadQueue, freeBytes, storageRoots } from './downloads.js';
import { createTorboxAccount } from './torbox.js';
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
  function queueLink(url, name) {
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
      sizeBytes: null
    };
    downloadQueue().enqueue(outside(filename), release, roomiest());
    return filename;
  }
  var listTorbox = () => account.list();
  var addToTorbox = (link) => account.add(link);

export { addToTorbox, listTorbox, queueLink, queueTorboxEntry, roomiest };
