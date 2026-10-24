// ADDED: the debrid accounts, kept in settings.json beside the speed limit: a TorBox and a
// Premiumize API key. With either set, every download goes through them (torbox.js, premiumize.js);
// with none, downloads resolve as before. Typing a key with the controller is slow, so the TorBox
// key is also read from a torbox.txt at the root of a USB drive, or pasted from a computer (remote.js).

import { useEffect, useState } from 'react';
import { consoleRoots } from './roots.js';
import { loadList, saveList } from './saved.js';
import { FileSystem, Platform } from '@ps5-react/core';

  var SETTINGS = "settings.json";
  // The services, in the order a link is tried.
  var SERVICES = {
    torbox: { name: "TorBox", setting: "torboxKey", site: "torbox.app/settings" },
    premiumize: { name: "Premiumize", setting: "premiumizeKey", site: "premiumize.me/account" }
  };
  var valid = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  var settings = () => loadList(SETTINGS, "settings");
  var keys = Object.fromEntries(Object.entries(SERVICES).map(([service, { setting }]) => [service, valid(settings()[setting]) ? settings()[setting] : ""]));
  var listeners = /* @__PURE__ */ new Set();
  var notify = () => {
    for (const listener of listeners) listener({ ...keys });
  };
  function saveSetting(name, value) {
    const { [name]: _old, ...rest } = settings();
    saveList(SETTINGS, "settings", value === void 0 || value === "" || value === false ? rest : { ...rest, [name]: value });
  }
  var getDebridKey = (service) => keys[service] ?? "";
  function setDebridKey(service, value) {
    const entry2 = SERVICES[service];
    if (!entry2) throw new Error(`Unknown debrid service ${service}.`);
    const key = String(value ?? "").trim();
    if (key && !valid(key)) throw new Error(`That isn't a ${entry2.name} API key. Copy it from ${entry2.site}.`);
    keys[service] = key;
    saveSetting(entry2.setting, key);
    notify();
  }
  // ADDED: for what follows a key outside React (the host lists of debrid-hosts.js).
  function onDebridKeys(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  var anyDebrid = () => Object.values(keys).some(Boolean);
  function useDebridKeys() {
    const [value, setValue] = (0, useState)({ ...keys });
    (0, useEffect)(() => {
      listeners.add(setValue);
      return () => {
        listeners.delete(setValue);
      };
    }, []);
    return value;
  }
  var getTorboxKey = () => keys.torbox;
  var setTorboxKey = (value) => setDebridKey("torbox", value);
  var useTorboxKey = () => useDebridKeys().torbox;
  var KEY_FILES = ["torbox.txt", "TORBOX.TXT", "torbox-key.txt"];
  // The first valid key in a key file on any drive, set as the key; the key found, or "".
  function importTorboxKey() {
    const roots = Platform.OS === "ps5" ? consoleRoots(() => FileSystem.mounts()).filter((root2) => root2 !== "/data") : [FileSystem.dataDir];
    for (const root2 of roots) {
      for (const name of KEY_FILES) {
        try {
          const path = `${root2}/${name}`;
          if (!FileSystem.exists(path)) continue;
          const key = String(FileSystem.readFile(path)).replace(/^﻿/, "").trim().split(/\s+/)[0] || "";
          if (!valid(key)) continue;
          if (key !== keys.torbox) setTorboxKey(key);
          return key;
        } catch (error2) {
          console.log(`[torbox] ${root2}/${name} not read: ${error2.message}`);
        }
      }
    }
    return "";
  }
  if (!keys.torbox) importTorboxKey();
  // A small setting of its own kind (a flag, a list), stored the same way.
  var readSetting = (name, fallback) => settings()[name] ?? fallback;

export { SERVICES, anyDebrid, getDebridKey, onDebridKeys, getTorboxKey, importTorboxKey, readSetting, saveSetting, setDebridKey, setTorboxKey, useDebridKeys, useTorboxKey };
