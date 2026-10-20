// ADDED: what this fork starts with the app, kept out of index.jsx so that merging upstream's
// changes there never conflicts: the page for the computer's browser (remote.js) and automatic
// TorBox downloads (torbox-queue.js). Imported once, at the top of index.jsx, for its effect; both
// start on the next tick, once the app's own startup has run.

import { startRemote } from './state/remote.js';
import { startAutoDownload } from './state/torbox-queue.js';

  setTimeout(() => {
    startRemote();
    startAutoDownload();
  }, 0);
