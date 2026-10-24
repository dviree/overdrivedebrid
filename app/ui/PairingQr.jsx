// ADDED: the QR code on the debrid sheet (TorboxSheet.jsx): the computer page's address with the
// pairing code in it (remote.js pairingLink), so a phone's camera opens the page already paired, as
// PS5 Library's settings do. Drawn from views, one per run of dark modules in a row.

import { jsx } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { qrcode } from '../state/qrcode.js';
import { View } from '@ps5-react/core';

  var QUIET = 4;
  function runs(text) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const found = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!qr.isDark(row, col)) continue;
        let end = col;
        while (end + 1 < count && qr.isDark(row, end + 1)) end++;
        found.push({ row, col, length: end - col + 1 });
        col = end;
      }
    }
    return { count, found };
  }
  function PairingQr({ text, size = 264 }) {
    const { count, found } = (0, useMemo)(() => runs(text), [text]);
    const cell = Math.max(1, Math.floor(size / (count + QUIET * 2)));
    const side = cell * (count + QUIET * 2);
    return /* @__PURE__ */ (0, jsx)(View, { style: { width: side, height: side, backgroundColor: "#ffffff", borderRadius: 12, position: "relative" }, children: found.map(({ row, col, length }) => /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", left: (col + QUIET) * cell, top: (row + QUIET) * cell, width: length * cell, height: cell, backgroundColor: "#000000" } }, `${row}:${col}`)) });
  }

export { PairingQr };
