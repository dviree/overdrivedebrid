---
title: "Most sources are listed as binary, so the format must be read from the source itself"
author: Claude
date: 2026-11-01
branch: claude/gifted-ramanujan-kuspln
id: l-71f53fbb
scope: repo
status: active
src: agent
touches:
  - "app/state/source-format.js#formatName"
  - "app/game/sources.js#describeSource"
  - app/game/VersionSheet.jsx
---

## Decided
The format is named from a binary source's own label, file name or link, because 18,784 of 24,013 catalog sources have format "binary" and showed no format at all; this names 10,747 instead of 5,229. Sizes that are the game's catalog estimate are marked ≈, because 18,308 sources have no sizeBytes and the fallback (the game's sizeGb) made players think the chosen version's size was wrong.

## Tried and ruled out
Guessing a format when the source says nothing: about 13,000 sources name none, and a wrong exFAT/FPKG label is worse than none.

## Watch out
formatName must stay free of console APIs (it lives outside game/sources.js) or its node test cannot load it, since sources.js reaches DeviceInfo through firmware.js.

In the code: formatName in app/state/source-format.js; describeSource in app/game/sources.js; summary2 in app/game/VersionSheet.jsx; statusLine's approx argument in app/game/DownloadLabel.jsx.
