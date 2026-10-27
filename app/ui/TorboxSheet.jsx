// ADDED: the debrid sheet, opened from Settings. It shows the address and pairing code for the
// computer's browser (remote.js), holds the TorBox, Premiumize and Real-Debrid API keys (typed, or the TorBox key
// read from a torbox.txt on a USB drive), turns automatic TorBox downloads on, and lists what the
// TorBox account holds, so a link added on torbox.app from a computer downloads with one press.

import '../assets/Inter-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { getTorboxKey, importTorboxKey, useDebridKeys } from '../state/debrid.js';
import { codeSecondsLeft, forgetDevice, forgetPaired, onCodeChange, pairedDevices, pairingCode, pairingLink, remoteAddress } from '../state/remote.js';
import { formatBytes } from '../state/size.js';
import { listTorbox, queueTorboxEntry, setAutoDownload, useAutoDownload } from '../state/torbox-queue.js';
import { FocusRing } from './FocusRing.jsx';
import { QRCode } from './QRCode.jsx';
import { SideSheet } from './SideSheet.jsx';
import { colors } from './colors.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  var masked = (key) => key.length > 8 ? `${key.slice(0, 4)}\u2026${key.slice(-4)}` : key;
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
    const keys = useDebridKeys();
    const key = keys.torbox;
    const auto = useAutoDownload();
    const [code, setCode] = (0, useState)(pairingCode());
    const [devices, setDevices] = (0, useState)(pairedDevices());
    const [left, setLeft] = (0, useState)(codeSecondsLeft());
    (0, useEffect)(() => onCodeChange((value) => {
      setCode(value);
      setDevices(pairedDevices());
    }), []);
    // The code lasts five minutes: the sheet counts down and shows the next one when it changes.
    (0, useEffect)(() => {
      const timer = setInterval(() => {
        setCode(pairingCode());
        setLeft(codeSecondsLeft());
      }, 1e3);
      return () => clearInterval(timer);
    }, []);
    const paired = devices.length;
    const [entries, setEntries] = (0, useState)(null);
    const [note, setNote] = (0, useState)("");
    const [loading, setLoading] = (0, useState)(false);
    const alive = (0, useRef)(true);
    const remote = remoteAddress();
    (0, useEffect)(() => () => {
      alive.current = false;
    }, []);
    const refresh = () => {
      if (!getTorboxKey() || loading) return;
      setLoading(true);
      setNote("");
      listTorbox().then((list) => alive.current && setEntries(list)).catch((error2) => alive.current && setNote(error2.message)).finally(() => alive.current && setLoading(false));
    };
    (0, useEffect)(refresh, [key]);
    const fromUsb = () => {
      const found = importTorboxKey();
      setNote(found ? t2("torbox.usbFound") : t2("torbox.usbMissing"));
    };
    const download = (entry2) => {
      try {
        setNote(t2("torbox.queued", { name: queueTorboxEntry(entry2) }));
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
      remote ? /* @__PURE__ */ (0, jsx)(Note, { children: t2("torbox.remote", { url: remote, code }) }) : null,
      remote ? /* @__PURE__ */ (0, jsx)(View, { style: { paddingHorizontal: 18, paddingVertical: 6 }, children: /* @__PURE__ */ (0, jsx)(QRCode, { text: pairingLink() || remote, size: 264 }) }) : null,
      remote ? /* @__PURE__ */ (0, jsx)(Note, { children: t2("torbox.codeLeft", { seconds: String(left) }) }) : null,
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:key", name: t2("torbox.key"), detail: key ? masked(key) : t2("torbox.keyMissing"), onPress: () => onEditKey("torbox") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:premiumize", name: t2("torbox.premiumizeKey"), detail: keys.premiumize ? masked(keys.premiumize) : t2("torbox.premiumizeMissing"), onPress: () => onEditKey("premiumize") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:realdebrid", name: t2("torbox.realdebridKey"), detail: keys.realdebrid ? masked(keys.realdebrid) : t2("torbox.realdebridMissing"), onPress: () => onEditKey("realdebrid") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:twocaptcha", name: t2("torbox.twocaptchaKey"), detail: keys.twocaptcha ? masked(keys.twocaptcha) : t2("torbox.twocaptchaMissing"), onPress: () => onEditKey("twocaptcha") }),
      /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:usb", name: t2("torbox.usb"), detail: t2("torbox.usbDetail"), onPress: fromUsb }),
      key ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:auto", name: t2("torbox.auto"), detail: auto ? t2("torbox.autoOn") : t2("torbox.autoOff"), onPress: () => void setAutoDownload(!auto) }) : null,
      paired ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:forget", name: t2("torbox.forget"), detail: t2("torbox.forgetDetail", { count: paired }), onPress: () => {
        forgetPaired();
        setDevices([]);
      } }) : null,
      devices.map((device) => /* @__PURE__ */ (0, jsx)(Row, { focusKey: `torbox:device:${device.id}`, name: t2("torbox.device", { name: device.name }), detail: t2("torbox.deviceDetail", { address: device.address || "?", date: device.at ? new Date(device.at).toLocaleDateString() : "?" }), onPress: () => {
        forgetDevice(device.id);
        setDevices(pairedDevices());
      } }, device.id)),
      key ? /* @__PURE__ */ (0, jsx)(Row, { focusKey: "torbox:refresh", name: loading ? t2("torbox.loading") : t2("torbox.refresh"), detail: t2("torbox.refreshDetail"), onPress: refresh }) : null,
      note ? /* @__PURE__ */ (0, jsx)(Note, { children: note }) : null,
      key && entries && !entries.length ? /* @__PURE__ */ (0, jsx)(Note, { children: t2("torbox.empty") }) : null,
      (key && entries ? entries : []).map((entry2) => /* @__PURE__ */ (0, jsx)(Row, { focusKey: `torbox:${entry2.key}`, name: entry2.name, detail: detailOf(entry2), dim: !entry2.ready, onPress: () => entry2.ready ? download(entry2) : setNote(t2("torbox.notReadyNote")) }, entry2.key))
    ] }) });
  }

export { TorboxSheet };
