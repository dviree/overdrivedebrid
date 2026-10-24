// ADDED: what this fork starts with the app, kept out of index.jsx so that merging upstream's
// changes there never conflicts: the page for the computer's browser (remote.js), automatic TorBox
// downloads (torbox-queue.js) and the debrid host lists (debrid-hosts.js). Imported once, at the top
// of index.jsx, for its effect; they start on the next tick, once the app's own startup has run.

import { onDebridKeys } from './state/debrid.js';
import { refreshHosts } from './state/debrid-hosts.js';
import { startRemote } from './state/remote.js';
import { startAutoDownload } from './state/torbox-queue.js';

  setTimeout(() => {
    startRemote();
    startAutoDownload();
    // Which hosts each debrid account takes, read again when a key changes.
    refreshHosts();
    onDebridKeys(() => void refreshHosts());
  }, 0);
