// ADDED: the fork's Debrid entry on the Settings page (SettingsScreen.jsx): its tile opens the debrid
// sheet (TorboxSheet.jsx: the computer page, TorBox's files, automatic downloads, 2Captcha), and the
// URL keyboard a key is typed on, which cover the whole page from its root (DebridOverlay). Premiumize
// has no device login an app may use, so its phone setup (PremiumizePhone) is the computer page: the
// QR code opens it on the phone already paired, the key is pasted there, and the dialog goes on.

import '../assets/Inter-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { useServices } from '../state/download-services.js';
import { pairingLink } from '../state/remote.js';
import { SERVICES, getDebridKey, setDebridKey, useDebridKeys } from '../state/debrid.js';
import { URLDialog } from '../downloads/URLDialog.jsx';
import { PhoneSetup } from '../downloads/PhoneSetup.jsx';
import { Button2 } from './Button.jsx';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { QRCode } from './QRCode.jsx';
import { TorboxSheet } from './TorboxSheet.jsx';
import { colors } from './colors.js';
import { FocusScope, Text, View, useIsFocused } from '@ps5-react/core';

  // `key` is the service being set up: TorBox and Real-Debrid by MyLuxy's phone login (PhoneSetup,
  // checked against the live APIs), Premiumize by the computer page, each with typing beside it;
  // `typed` is the URL keyboard for a key.
  var open = { sheet: false, key: null, typed: null };
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
  var openDebridSheet = () => set({ sheet: true });
  var TEXT = { fontFamily: "Inter-Regular", color: colors.fg };
  function PremiumizePhone({ onField, onDone }) {
    const t2 = useT();
    const services = useServices();
    const key = services.premiumize;
    // The link renews with the pairing code (five minutes, used once): read it again each second.
    const [link, setLink] = (0, useState)(pairingLink);
    (0, useEffect)(() => {
      const timer = setInterval(() => setLink(pairingLink()), 1e3);
      return () => clearInterval(timer);
    }, []);
    // A key pasted on the phone is saved like a typed one: the dialog then goes on by itself.
    const [startKey] = (0, useState)(key);
    (0, useEffect)(() => {
      if (key && key !== startKey) {
        const after = setTimeout(onDone, 1200);
        return () => clearTimeout(after);
      }
      return void 0;
    }, [key]);
    const linked = Boolean(key && key !== startKey);
    return /* @__PURE__ */ (0, jsx)(FocusScope, {
      trap: true, autoFocus: true,
      onBack: () => {
        onDone();
        return true;
      },
      children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, alignItems: "center", justifyContent: "center", backgroundColor: "#000000f2" }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: 1320, gap: 30, borderRadius: 18, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface, padding: 48 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "center", gap: 18 }, children: [
          /* @__PURE__ */ (0, jsx)(Icon, { name: "premiumize", size: 44, color: colors.fg }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 34, fontWeight: 600 }, children: t2("add.setupTitle", { service: "Premiumize" }) })
        ] }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 48 }, children: [
          link && !linked ? /* @__PURE__ */ (0, jsx)(QRCode, { text: `${link}&focus=premiumize`, size: 380 }) : /* @__PURE__ */ (0, jsx)(View, { style: { width: 380, height: 380, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: colors.surface2 }, children: /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 24, color: linked ? colors.ok : colors.muted, lineHeight: 34, textAlign: "center" }, children: linked ? t2("add.phone.linked") : t2("settings.premiumizePhoneOffline") }) }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 18 }, children: [
            /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 30, fontWeight: 600 }, children: t2("add.phone.title") }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 22, color: colors.muted, lineHeight: 32 }, children: t2("add.phone.step1") }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 22, color: colors.muted, lineHeight: 32 }, children: t2("settings.premiumizePhoneStep2") }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 20, color: colors.subtle, lineHeight: 28 }, children: t2("settings.premiumizePhoneNote") }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 19, color: colors.subtle, paddingTop: 6 }, children: t2("add.phone.or") }),
            /* @__PURE__ */ (0, jsxs)(View, {
              focusKey: "settings:premiumize:field",
              onPress: onField,
              style: (focus) => [{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 12, paddingHorizontal: 16, height: 64, backgroundColor: colors.surface2 }, focus.focused ? { backgroundColor: colors.surface3 } : null],
              children: [
                /* @__PURE__ */ (0, jsx)(FocusRing, {}),
                /* @__PURE__ */ (0, jsx)(Icon, { name: "link", size: 20, color: colors.muted }),
                /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, flex: 1, fontSize: 22 }, children: t2("add.field.premiumize") }),
                /* @__PURE__ */ (0, jsx)(Text, { style: { ...TEXT, fontSize: 20, color: key ? colors.fg : colors.subtle, numberOfLines: 1 }, children: key ? `\u2022\u2022\u2022\u2022${key.slice(-4)}` : t2("add.notSet") })
              ]
            })
          ] })
        ] }),
        /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 12 }, children: /* @__PURE__ */ (0, jsx)(Button2, { label: t2("add.continue"), focusKey: "settings:premiumize:done", autoFocus: true, onPress: onDone }) })
      ] }) })
    });
  }
  function DebridOverlay() {
    const t2 = useT();
    const { sheet, key, typed } = useOpen();
    (0, useEffect)(() => () => set({ sheet: false, key: null, typed: null }), []);
    if (typed) return /* @__PURE__ */ (0, jsx)(URLDialog, {
      title: t2("settings.debridKeyTitle", { service: SERVICES[typed].name }),
      detail: t2("settings.debridKeyDetail", { site: SERVICES[typed].site }),
      initial: getDebridKey(typed),
      confirmLabel: t2("settings.torboxKeyConfirm"),
      submit: (value) => setDebridKey(typed, value),
      onClose: () => set({ typed: null, key: null })
    });
    if (key === "torbox" || key === "realdebrid") return /* @__PURE__ */ (0, jsx)(PhoneSetup, {
      service: key,
      onField: () => set({ typed: key }),
      onDone: () => set({ key: null }),
      onCancel: () => set({ key: null })
    });
    if (key === "premiumize") return /* @__PURE__ */ (0, jsx)(PremiumizePhone, { onField: () => set({ typed: key }), onDone: () => set({ key: null }) });
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

export { DebridOverlay, DebridRow, PremiumizePhone, openDebridSheet };
