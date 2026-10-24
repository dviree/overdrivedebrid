// ADDED: which file hosts each debrid account takes, as PS5 Library shows it per source. TorBox
// (/webdl/hosters) and Premiumize (/services/list) list them; the lists are read with the account's
// key, kept a day in settings.json, and read again when a key changes. A link to a host its list
// leaves out skips that service instead of costing a refused request, and the game page names the
// accounts that can take a source. While a list is unknown every host counts as taken.

import { SERVICES, getDebridKey, readSetting, saveSetting } from './debrid.js';
import { webURL } from './download-sources.js';
import { Http } from '@ps5-react/core';

  var DAY_MS = 24 * 60 * 60 * 1e3;
  var SETTING = "debridHosts";
  var lists = readSetting(SETTING, {});
  var reading = /* @__PURE__ */ new Set();
  var DOMAIN = /\b((?:[a-z0-9-]+\.)+[a-z]{2,24})\b/gi;
  // Every domain name a list holds, whatever its shape: TorBox's hosters carry them under `domains`
  // or `url`, Premiumize's are plain names under `directdl`.
  function domainsIn(value) {
    const found = /* @__PURE__ */ new Set();
    for (const match of JSON.stringify(value ?? null).matchAll(DOMAIN)) {
      const domain = match[1].toLowerCase().replace(/^www\./, "");
      if (!/\.(?:png|jpe?g|svg|webp|gif|ico|json|html?)$/.test(domain) && !/(?:^|\.)(?:torbox\.app|premiumize\.me)$/.test(domain)) found.add(domain);
    }
    return [...found];
  }
  var READERS = {
    async torbox(key) {
      const response = await Http.request("https://api.torbox.app/v1/api/webdl/hosters", { maxBytes: 4 * 1024 * 1024, followRedirects: false, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) throw new Error(payload?.detail || `HTTP ${response.status}`);
      return domainsIn(payload?.data);
    },
    async premiumize(key) {
      const response = await Http.request(`https://www.premiumize.me/api/services/list?apikey=${encodeURIComponent(key)}`, { maxBytes: 4 * 1024 * 1024 });
      const payload = await response.json();
      if (!response.ok || payload?.status === "error") throw new Error(payload?.message || `HTTP ${response.status}`);
      return domainsIn(payload?.directdl ?? payload);
    }
  };
  async function readList(service, { force = false } = {}) {
    const key = getDebridKey(service);
    const kept = lists[service];
    if (!key || reading.has(service) || !force && kept?.key === key.slice(-6) && Date.now() - kept.at < DAY_MS) return;
    reading.add(service);
    try {
      const hosts = await READERS[service](key);
      // An empty answer is no list: every host stays allowed rather than none.
      if (!hosts.length) return;
      lists = { ...lists, [service]: { at: Date.now(), key: key.slice(-6), hosts } };
      saveSetting(SETTING, lists);
      console.log(`[debrid-hosts] ${SERVICES[service].name}: ${hosts.length} hosts`);
    } catch (error2) {
      console.log(`[debrid-hosts] ${SERVICES[service].name} hosts not read: ${error2.message}`);
    } finally {
      reading.delete(service);
    }
  }
  var refreshHosts = (options) => Promise.all(Object.keys(READERS).map((service) => readList(service, options)));
  var isHost = (host2, domain) => host2 === domain || host2.endsWith(`.${domain}`);
  // Whether `service` takes a link to `url`: true while its list is unknown or the key is newer.
  function supports(service, url) {
    const list = lists[service];
    const key = getDebridKey(service);
    if (!list?.hosts?.length || !key || list.key !== key.slice(-6)) return true;
    let host2;
    try {
      host2 = webURL(url).host.replace(/^www\./, "");
    } catch {
      return false;
    }
    return list.hosts.some((domain) => isHost(host2, domain));
  }
  // How many hosts a service's list names, or 0 while it is unknown.
  var hostCount = (service) => lists[service]?.hosts?.length || 0;
  // The accounts that can take a release's link (its first part's, for a set), for the game page.
  function accountsFor(release) {
    const first = release?.parts?.[0]?.sources?.[0] ?? release;
    const url = first?.browserUrl || first?.url;
    if (!url || first?.manifestUrl) return [];
    return Object.keys(READERS).filter((service) => getDebridKey(service) && lists[service]?.hosts?.length && supports(service, url)).map((service) => SERVICES[service].name);
  }

export { accountsFor, hostCount, refreshHosts, supports };
