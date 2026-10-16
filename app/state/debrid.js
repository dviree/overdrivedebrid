// ADDED: the TorBox API key, kept in settings.json beside the speed limit. Set, every download
// goes through TorBox (torbox.js); cleared, downloads resolve as before. Typing a key with the
// controller is slow, so it is also read from a torbox.txt at the root of a USB drive, written on a
// computer.

import { useEffect, useState } from 'react';
import { consoleRoots } from './roots.js';
import { loadList, saveList } from './saved.js';
import { FileSystem, Platform } from '@ps5-react/core';

  var SETTINGS = "settings.json";
  var valid = (value) => typeof value === "string" && /^[A-Za-z0-9-]{8,128}$/.test(value);
  var saved = loadList(SETTINGS, "settings").torboxKey;
  var torboxKey = valid(saved) ? saved : "";
  var listeners = /* @__PURE__ */ new Set();
  var getTorboxKey = () => torboxKey;
  function setTorboxKey(value) {
    const key = String(value ?? "").trim();
    if (key && !valid(key)) throw new Error("That isn't a TorBox API key. Copy it from torbox.app/settings.");
    torboxKey = key;
    const { torboxKey: _old, ...settings } = loadList(SETTINGS, "settings");
    saveList(SETTINGS, "settings", key ? { ...settings, torboxKey: key } : settings);
    for (const listener of listeners) listener(key);
  }
  function useTorboxKey() {
    const [key, setKey] = (0, useState)(torboxKey);
    (0, useEffect)(() => {
      listeners.add(setKey);
      return () => {
        listeners.delete(setKey);
      };
    }, []);
    return key;
  }

  var KEY_FILES = ["torbox.txt", "TORBOX.TXT", "torbox-key.txt"];
  // The first valid key in a key file on any drive, set as the key; the key found, or "".
  function importTorboxKey() {
    const roots = Platform.OS === "ps5" ? consoleRoots(() => FileSystem.mounts()).filter((root2) => root2 !== "/data") : [FileSystem.dataDir];
    for (const root2 of roots) {
      for (const name of KEY_FILES) {
        try {
          const path = `${root2}/${name}`;
          if (!FileSystem.exists(path)) continue;
          const key = String(FileSystem.readFile(path)).replace(/^\uFEFF/, "").trim().split(/\s+/)[0] || "";
          if (!valid(key)) continue;
          if (key !== torboxKey) setTorboxKey(key);
          return key;
        } catch (error2) {
          console.log(`[torbox] ${root2}/${name} not read: ${error2.message}`);
        }
      }
    }
    return "";
  }
  if (!torboxKey) importTorboxKey();

export { getTorboxKey, importTorboxKey, setTorboxKey, useTorboxKey };
