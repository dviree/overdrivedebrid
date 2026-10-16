// ADDED: the TorBox sheet, opened from Settings. It holds the API key (typed, or read from a
// torbox.txt on a USB drive) and lists what the TorBox account holds, so a link added on torbox.app
// from a computer can be downloaded to the console with one press.

import '../assets/Inter-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { getTorboxKey, importTorboxKey, useTorboxKey } from '../state/debrid.js';
import { downloadQueue, freeBytes, storageRoots } from '../state/downloads.js';
import { formatBytes } from '../state/size.js';
import { createTorboxAccount } from '../state/torbox.js';
import { FocusRing } from './FocusRing.jsx';
import { SideSheet } from './SideSheet.jsx';
import { colors } from './colors.js';
import { Http, Text, View, useIsFocused } from '@ps5-react/core';

  var account = createTorboxAccount({ http: Http, apiKey: getTorboxKey });
  var TORBOX_GAME = (name) => ({ id: "torbox", titleId: "TORBOX", title: name });
  var masked = (key) => key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
  // The drive with the most free space; the console's own storage when none is listed.
  function roomiest() {
    const roots = storageRoots();
    return roots.map((root2) => ({ root: root2, free: freeBytes(root2) ?? -1 })).sort((a, b) => b.free - a.free)[0]?.root ?? roots[0];
  }
  function Face({ name, detail: detail2, dim }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 23, fontWeight: 600, color: dim ? colors.muted : "#f2f2f3", numberOfLines: 1, ellipsizeMode: "tail" }, children: name }),
        detail2 ? /* @__PURE__ */ (0, jsx)(Text, { style: [{ fontFamily: "Inter-Regular", fontSize: 21, lineHeight: 30, numberOfLines: 2, ellipsizeMode: "tail" }, { color: focused ? colors.fg : colors.muted }], children: detail2 }) : null
      ] })
    ] });
  }
  function Row({ focusKey, name, detail: detail2, dim, onPress }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey, onPress, style: (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 24, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 18 }, _state.focused ? { backgroundColor: "#212125" } : null], children: /* @__PURE__ */ (0, jsx)(Face, { name, detail: detail2, dim }) });
  }
  function Note({ children }) {
    return /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.muted, lineHeight: 30, paddingHorizontal: 18, paddingVertical: 6 }, children });
  }
  function TorboxSheet({ onClose, onEditKey }) {
    const t2 = useT();
    const key = useTorboxKey();
    const [entries, setEntries] = (0, useState)(null);
    const [note, setNote] = (0, useState)("");
    const [loading, setLoading] = (0, useState)(false);
    const alive = (0, useRef)(true);
    (0, useEffect)(() => () => {
      alive.current = false;
    }, []);
    const refresh = () => {
      if (!getTorboxKey() || loading) return;
      setLoading(true);
      setNote("");
      account.list().then((list) => alive.current && setEntries(list)).catch((error2) => alive.current && setNote(error2.message)).finally(() => alive.current && setLoading(false));
    };
    (0, useEffect)(refresh, [key]);
    const fromUsb = () => {
      const found = importTorboxKey();
      setNote(found ? t2("torbox.usbFound") : t2("torbox.usbMissing"));
    };
    const download = (entry2) => {
      try {
        downloadQueue().enqueue(TORBOX_GAME(entry2.name), account.release(entry2), roomiest());
        setNote(t2("torbox.queued", { name: entry2.name }));
      } catch (error2) {
        setNote(error2.message);
      }
    };
    const detailOf = (entry2) => [
      entry2.sizeBytes ? formatBytes(entry2.sizeBytes) : null,
      t2(`torbox.kind.${entry2.kind}`),
      entry2.ready ? t2("torbox.ready") : entry2.progress != null ? t2("torbox.progress", { percent: String(Math.round(Math.min(1, entry2.progress) * 100)) }) : entry2.state || t2("torbox.notReady")
    ].filter(Boolean).join(" \xB7 ");
    return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("torbox.title"), subtitle: t2("torbox.subtitle"), onClose, children: /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6, padding: 9, paddingBottom: 48 }, children: [
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:key", name: t2("torbox.key"), detail: key ? masked(key) : t2("torbox.keyMissing"), onPress: onEditKey }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:usb", name: t2("torbox.usb"), detail: t2("torbox.usbDetail"), onPress: fromUsb }),
      key ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:refresh", name: loading ? t2("torbox.loading") : t2("torbox.refresh"), detail: t2("torbox.refreshDetail"), onPress: refresh }) : null,
      note ? /* @__PURE__ */ (0, jsx)(Note, { children: note }) : null,
      key && entries && !entries.length ? /* @__PURE__ */ (0, jsx)(Note, { children: t2("torbox.empty") }) : null,
      (key && entries ? entries : []).map((entry2) => /* @__PURE__ */ (0, jsx)(Row, { focusKey: `torbox:${entry2.key}`, name: entry2.name, detail: detailOf(entry2), dim: !entry2.ready, onPress: () => entry2.ready ? download(entry2) : setNote(t2("torbox.notReadyNote")) }, entry2.key))
    ] }) });
  }

export { TorboxSheet };
