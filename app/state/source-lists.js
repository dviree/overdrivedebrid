// ADDED: the source lists torbox-queue.js reads, in the shapes other PS5 stores publish: FPKGi's
// `DATA` object (link → item), Pegasus' `packages` with their `downloadLinks`, and PS5 Library's and
// homebrew.page's `entries` (or `apps`) with `files` or `source_sets`. Each link becomes one entry;
// a release in several files lists each file under the release's title.

import { webURL } from './download-sources.js';

  var MAX_ENTRIES = 5e3;
  var text = (value, max) => value == null || value === "" ? null : String(value).slice(0, max);
  var bytes = (value) => Number(value) > 0 ? Number(value) : null;
  function entry({ url, name, sizeBytes, region, version, minFirmware }) {
    try {
      return [{
        url: webURL(url).url,
        name: String(name || String(url).split("/").pop() || "").slice(0, 200),
        sizeBytes: bytes(sizeBytes),
        region: text(region, 8),
        version: text(version, 16),
        minFirmware: text(minFirmware, 16)
      }];
    } catch {
      return [];
    }
  }
  var named = (title, part, many) => many && part ? `${title} – ${part}` : title || part;
  function fpkgi(data) {
    return Object.entries(data).flatMap(([link, item]) => entry({ url: link, name: item?.name, sizeBytes: item?.size, region: item?.region, version: item?.version, minFirmware: item?.min_fw }));
  }
  function pegasus(packages) {
    return packages.flatMap((item) => {
      const links = (Array.isArray(item?.downloadLinks) ? item.downloadLinks : []).filter((link) => typeof link?.url === "string");
      const title = item?.title || item?.name || item?.titleId;
      return links.flatMap((link) => entry({ url: link.url, name: named(title, link.name, links.length > 1), sizeBytes: links.length > 1 ? link.sizeBytes : item?.sizeBytes ?? link.sizeBytes, region: item?.region, version: item?.version, minFirmware: item?.minFirmware ?? item?.firmware }));
    });
  }
  function library(items) {
    return items.flatMap((item) => {
      const sets = Array.isArray(item?.source_sets) ? item.source_sets : [];
      const own = Array.isArray(item?.files) ? item.files : [];
      const files = [...own, ...sets.flatMap((set) => (Array.isArray(set?.files) ? set.files : []).map((file) => typeof file === "string" ? { url: file, host: set?.host } : { ...file, host: file?.host ?? set?.host }))].map((file) => typeof file === "string" ? { url: file } : file).filter((file) => typeof file?.url === "string");
      const single = item?.url || item?.download_url || item?.download;
      if (!files.length && typeof single === "string") files.push({ url: single, size: item?.size });
      const title = item?.title || item?.name || item?.title_id;
      return files.flatMap((file) => entry({ url: file.url, name: named(title, file.name || file.host, files.length > 1), sizeBytes: files.length > 1 ? file.size : item?.size ?? file.size, region: item?.region, version: item?.version, minFirmware: item?.firmware ?? item?.min_fw }));
    });
  }
  function parseSourceList(value) {
    const data = value?.DATA ?? value?.data;
    let found;
    if (data && typeof data === "object" && !Array.isArray(data)) found = fpkgi(data);
    else if (Array.isArray(value?.packages)) found = pegasus(value.packages);
    else if (Array.isArray(value?.entries) || Array.isArray(value?.apps)) found = library(value.entries ?? value.apps);
    else if (Array.isArray(value)) found = library(value);
    else throw new Error("The list is not one this app reads (FPKGi, Pegasus or PS5 Library).");
    return found.slice(0, MAX_ENTRIES);
  }

export { parseSourceList };
