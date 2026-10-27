// ../pub-game-store/native/state/downloads.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: sources resolve through TorBox, Premiumize and Real-Debrid when their API keys are set.

import { getGame } from './catalog.js';
import { driveName, driveShortName } from './drive-names.js';
import { createDownloadQueue } from './download-queue.js';
import { createSourceResolver } from './download-sources.js';
import { getDebridKey, getTorboxKey } from './debrid.js';
import { createTorboxResolver } from './torbox.js';
import { createPremiumizeResolver } from './premiumize.js';
import { supports } from './debrid-hosts.js';
import { createCaptchaResolver } from './captcha.js';
import { createRealDebridResolver } from './realdebrid.js';
import { createMockDownloadQueue } from './mock-download-queue.js';
import { consoleRoots } from './roots.js';
import { createShadowMountProbe } from './shadowmount.js';
import { Archives, BrowserCapture, DownloadFormats, Downloads, FileSystem, Http, Linking, Notifications, Packages, Platform, Power } from '@ps5-react/core';

  var instance;
  var mocked = () => Platform.OS !== "ps5" && FileSystem.exists(`${FileSystem.dataDir}/overdrive/mock-downloads`);
  var stateDir = Platform.OS === "ps5" ? "/data/ps5-react/PPSA99058/queue" : void 0;
  var downloadQueue = () => instance ?? (instance = mocked() ? createMockDownloadQueue() : createDownloadQueue({
    fs: FileSystem,
    archives: Archives,
    downloads: Downloads,
    http: Http,
    formats: DownloadFormats,
    dataDir: FileSystem.dataDir,
    stateDir,
    platform: Platform.OS,
    notifications: Notifications,
    power: Power,
    linking: Linking,
    // TorBox, then Premiumize, then Real-Debrid, then the host itself (its captcha solved by 2Captcha when a key is
    // set): each passes on what it won't take.
    sources: createTorboxResolver({
      http: Http,
      apiKey: getTorboxKey,
      supports: (url) => supports("torbox", url),
      fallback: createPremiumizeResolver({ http: Http, apiKey: () => getDebridKey("premiumize"), supports: (url) => supports("premiumize", url), fallback: createRealDebridResolver({
        http: Http,
        apiKey: () => getDebridKey("realdebrid"),
        supports: (url) => supports("realdebrid", url),
        fallback: createCaptchaResolver({ http: Http, fallback: createSourceResolver({ http: Http }) })
      }) })
    }),
    packages: Packages,
    browserCapture: BrowserCapture,
    releasesOf: (id) => getGame(id)?.releases || []
  }));
  var shadowMountUp = Platform.OS === "ps5" ? createShadowMountProbe({ http: Http, now: Date.now }) : async () => true;
  function freeBytes(root2) {
    try {
      return FileSystem.diskUsage(root2).free;
    } catch {
      return null;
    }
  }
  function storageRoots() {
    if (Platform.OS !== "ps5") return [FileSystem.dataDir];
    return consoleRoots(() => FileSystem.mounts());
  }

export { downloadQueue, driveName, driveShortName, freeBytes, shadowMountUp, storageRoots };
