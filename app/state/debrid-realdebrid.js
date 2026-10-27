// ADDED: Real-Debrid (https://real-debrid.com) in the chain every download goes through, after TorBox
// and Premiumize (downloads.js). Upstream's client (realdebrid.js) unrestricts the host link into a
// link on Real-Debrid's own servers. A link Real-Debrid won't take goes on to the next resolver; a
// token it refuses, or an account it has locked, fails the download, so a wrong token never passes
// unnoticed.

import { webURL } from './download-sources.js';
import { createRealDebrid } from './realdebrid.js';

  var REFUSED = /rejected the token|refused the account/i;
  function createRealDebridResolver({ http, fallback, apiKey, supports = () => true }) {
    async function resolve2(release, options = {}) {
      const key = apiKey();
      const link = release.browserUrl || release.url;
      if (!key || release.torbox || options.noDebrid || options.directURL || release.manifestUrl || !link || !supports(link)) return fallback.resolve(release, options);
      try {
        const { url, sizeBytes } = await createRealDebrid({ http, key }).unrestrict(webURL(link).url, { signal: options.signal });
        return { url: webURL(url).url, rejectHtml: true, ...sizeBytes > 0 ? { expectedBytes: sizeBytes } : {} };
      } catch (error2) {
        if (REFUSED.test(error2.message) || options.signal?.aborted) throw error2;
        console.log(`[realdebrid] ${error2.message}; resolving ${release.provider || "the source"} directly`);
        return fallback.resolve(release, options);
      }
    }
    return { resolve: resolve2, debrid: () => Boolean(apiKey()) || Boolean(fallback.debrid?.()) };
  }

export { createRealDebridResolver };
