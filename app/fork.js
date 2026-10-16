// ADDED: this fork's build number, so a build of it is an update over the last one even when the
// upstream version (version.js, merged from MyLuxy/overdrive) stays the same. The build workflow
// writes the run number here before building; 0 is a local build. The app updates to
// `${VERSION}.${FORK}`: 1.0.5.7 is newer than 1.0.5.6, and upstream's 1.0.6 builds as 1.0.6.8.
// Kept apart from version.js so merging upstream never conflicts here.

import { VERSION } from './version.js';

  var FORK = 0;
  var FORK_VERSION = `${VERSION}.${FORK}`;
  // This fork's releases, which carry upstream's changes merged in (sync-upstream.yml).
  var FORK_FEED = "https://api.github.com/repos/dviree/overdrivedebrid/releases/latest";

export { FORK, FORK_FEED, FORK_VERSION };
