// ADDED: which file hosts each debrid account takes, as PS5 Library shows it per source. TorBox
// (/webdl/hosters), Premiumize (/services/list) and Real-Debrid (/hosts/domains) list them; the lists are read with the account's
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
      if (!/\.(?:png|jpe?g|svg|webp|gif|ico|json|html?)$/.test(domain) && !/(?:^|\.)(?:torbox\.app|premiumize\.me|real-debrid\.com)$/.test(domain)) found.add(domain);
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
    },
    // Real-Debrid's list needs no token: an array of domain names.
    async realdebrid() {
      const response = await Http.request("https://api.real-debrid.com/rest/1.0/hosts/domains", { maxBytes: 1024 * 1024, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return domainsIn(await response.json());
    }
  };
  async function readList(service, { force = false } = {}) {
    const key = getDebridKey(service);
    const kept = lists[service];
    if (!key || reading.has(service) || !force && kept?.key === key.slice(-6) && Date.now() - kept.at < DAY_MS) return;
    reading.add(service);
    try {
      const hosts = await READERS[service](key);
      // An empty answer is no list: every host stays allowed rather than none. Nor is one that names
      // none of the hosts every service takes: a list read the wrong way would turn the service off
      // for every link, so it counts as unknown and every host stays allowed.
      if (!hosts.length) return;
      if (!KNOWN.some((domain) => hosts.includes(domain))) {
        console.log(`[debrid-hosts] ${SERVICES[service].name}: the list names none of ${KNOWN.join(", ")}; not used`);
        return;
      }
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
  // A host on the home network (a qBittorrent's WebUI, a NAS): no debrid service can reach it.
  var PRIVATE = /^(?:localhost|[^.]+|.+\.(?:local|lan|home|internal)|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])(?::\d+)?$/i;
  function privateHost(url) {
    try {
      return PRIVATE.test(webURL(url).host);
    } catch {
      return false;
    }
  }
  // Whether `service` takes a link to `url`: true while its list is unknown or the key is newer.
  function supports(service, url) {
    if (privateHost(url)) return false;
    const list = lists[service];
    const key = getDebridKey(service);
    if (!usable(list) || !key || list.key !== key.slice(-6)) return true;
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
  // Hosts both services are known to take, for a key whose list is not read yet (the first start
  // after it is set, or with no network): the catalog's paused hosts open for them at once.
  var KNOWN = ["1fichier.com", "rapidgator.net", "mega.nz", "gofile.io"];
  // A kept list is used only if it names one of those: one saved by an earlier build that read it
  // the wrong way is ignored rather than turning the service off.
  var usable = (list) => Boolean(list?.hosts?.length) && KNOWN.some((domain) => list.hosts.includes(domain));
  // Whether `service`'s account takes `url` for sure: its key is set and its list names the host
  // (or, with no list yet, the host is one of KNOWN).
  function takes(service, url) {
    if (!getDebridKey(service)) return false;
    let host2;
    try {
      host2 = webURL(url).host.replace(/^www\./, "");
    } catch {
      return false;
    }
    const list = lists[service];
    const domains = usable(list) && list.key === getDebridKey(service).slice(-6) ? list.hosts : KNOWN;
    return domains.some((domain) => isHost(host2, domain));
  }
  // The accounts that can take a release's link (its first part's, for a set), for the game page.
  function accountsFor(release) {
    const first = release?.parts?.[0]?.sources?.[0] ?? release;
    const url = first?.browserUrl || first?.url;
    if (!url || first?.manifestUrl) return [];
    return Object.keys(READERS).filter((service) => takes(service, url)).map((service) => SERVICES[service].name);
  }
  // The catalog's host keys (game.providers) as a domain, for the paused host filters.
  var PROVIDER_DOMAINS = {
    "1fichier": "1fichier.com", rapidgator: "rapidgator.net", mega: "mega.nz", gofile: "gofile.io", datavaults: "datavaults.co",
    buzzheavier: "buzzheavier.com", ranoz: "ranoz.gg", transfer: "transfer.it", "rootz.so": "rootz.so", fuckingfast: "fuckingfast.co",
    "1024terabox": "1024terabox.com", fileditchfiles: "fileditchfiles.me", datanodes: "datanodes.to", akirabox: "akirabox.com"
  };
  var providerTaken = (provider) => Boolean(PROVIDER_DOMAINS[provider]) && Object.keys(READERS).some((service) => takes(service, `https://${PROVIDER_DOMAINS[provider]}/`));

export { accountsFor, hostCount, providerTaken, refreshHosts, supports };
