// ADDED: the TorBox API key, kept in settings.json beside the speed limit. Set, every download
// goes through TorBox (torbox.js); cleared, downloads resolve as before.

import { useEffect, useState } from 'react';
import { loadList, saveList } from './saved.js';

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

export { getTorboxKey, setTorboxKey, useTorboxKey };
