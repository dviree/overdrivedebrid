// ADDED: the fork's Debrid entry on the Settings page (SettingsScreen.jsx): a row under Downloads that
// opens the debrid sheet (TorboxSheet.jsx), and the URL keyboard a key is typed on. The row sits in
// the page's left column; the sheet and keyboard cover the whole page, so they render from the page's
// root (DebridOverlay), sharing which is open through this module. An empty key turns that service off.

import '../assets/Inter-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { SERVICES, getDebridKey, setDebridKey, useDebridKeys } from '../state/debrid.js';
import { URLDialog } from '../downloads/URLDialog.jsx';
import { FocusRing } from './FocusRing.jsx';
import { TorboxSheet } from './TorboxSheet.jsx';
import { colors } from './colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  var open = { sheet: false, key: null };
  var listeners = /* @__PURE__ */ new Set();
  function set(next) {
    open = { ...open, ...next };
    for (const listener of listeners) listener(open);
  }
  function useOpen() {
    const [value, setValue] = (0, useState)(open);
    (0, useEffect)(() => {
      listeners.add(setValue);
      return () => listeners.delete(setValue);
    }, []);
    return value;
  }
  function Face({ name, detail: detail2 }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 23, fontWeight: 600, color: colors.fg }, children: name }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ fontFamily: "Inter-Regular", fontSize: 21, lineHeight: 30 }, { color: focused ? colors.fg : colors.muted }], children: detail2 })
      ] })
    ] });
  }
  function DebridRow() {
    const t2 = useT();
    const keys = useDebridKeys();
    const on = Object.entries(keys).some(([service, key]) => key && !SERVICES[service].solver);
    return /* @__PURE__ */ (0, jsx)(View, { focusKey: "settings:debrid", onPress: () => set({ sheet: true }), style: (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 24, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14 }, _state.focused ? { backgroundColor: "#212125" } : null], children: /* @__PURE__ */ (0, jsx)(Face, { name: t2("settings.torbox"), detail: on ? t2("settings.torboxOn") : t2("settings.torboxOff") }) });
  }
  function DebridOverlay() {
    const t2 = useT();
    const { sheet, key } = useOpen();
    (0, useEffect)(() => () => set({ sheet: false, key: null }), []);
    if (key) return /* @__PURE__ */ (0, jsx)(URLDialog, {
      title: t2("settings.debridKeyTitle", { service: SERVICES[key].name }),
      detail: t2("settings.debridKeyDetail", { site: SERVICES[key].site }),
      initial: getDebridKey(key),
      confirmLabel: t2("settings.torboxKeyConfirm"),
      submit: (value) => setDebridKey(key, value),
      onClose: () => set({ key: null })
    });
    if (sheet) return /* @__PURE__ */ (0, jsx)(TorboxSheet, { onClose: () => set({ sheet: false }), onEditKey: (service) => set({ key: service }) });
    return null;
  }

export { DebridOverlay, DebridRow };
