// ADDED: Premiumize (https://www.premiumize.me), beside TorBox (torbox.js). Its direct download
// (/api/transfer/directdl) turns a host link, or a torrent Premiumize already holds, into links on
// its own servers; the largest file is the game. A link Premiumize won't take goes on to the app's
// own resolver; a key it refuses fails the download, so a wrong key never passes unnoticed.

import { webURL } from './download-sources.js';

  var API = "https://www.premiumize.me/api";
  var AUTH = /not logged in|customer_id|apikey|api key|unauthori[sz]ed|banned/i;
  var PremiumizeRefused = class extends Error {
  };
  var form = (fields) => Object.entries(fields).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  async function directLink({ http, key, link, signal }) {
    const response = await http.request(`${API}/transfer/directdl?apikey=${encodeURIComponent(key)}`, {
      method: "POST",
      signal,
      followRedirects: false,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form({ src: link })
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
    }
    const message = data?.message || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403 || data?.status === "error" && AUTH.test(message))
      throw new Error(`Premiumize refused the API key (${message}). Check it in Settings.`);
    if (!response.ok || data?.status !== "success") throw new PremiumizeRefused(`Premiumize: ${message}`);
    const file = (Array.isArray(data.content) ? data.content : []).filter((item) => typeof item?.link === "string").sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))[0];
    if (!file) throw new PremiumizeRefused("Premiumize returned no file.");
    return { url: webURL(file.link).url, rejectHtml: true };
  }
  function createPremiumizeResolver({ http, fallback, apiKey, supports = () => true }) {
    async function resolve2(release, options = {}) {
      const key = apiKey();
      if (!key || release.torbox || options.noDebrid || options.directURL || release.manifestUrl || !(release.browserUrl || release.url) || !supports(release.browserUrl || release.url)) return fallback.resolve(release, options);
      try {
        return await directLink({ http, key, link: webURL(release.browserUrl || release.url).url, signal: options.signal });
      } catch (error2) {
        if (!(error2 instanceof PremiumizeRefused) || options.signal?.aborted) throw error2;
        console.log(`[premiumize] ${error2.message}; resolving ${release.provider || "the source"} directly`);
        return fallback.resolve(release, options);
      }
    }
    return { resolve: resolve2, debrid: () => Boolean(apiKey()) || Boolean(fallback.debrid?.()) };
  }

export { createPremiumizeResolver };
