---
title: TorBox CDN host is tb-cdn.st
author: Claude
date: 2026-10-30
branch: claude/gifted-ramanujan-kuspln
cost: { minutes: 123, tokens: 2903585 }
id: l-aec07883
scope: repo
status: active
src: agent
touches:
  - "ps5-react/native/shared/network.cpp#debrid_cdn"
  - "app/state/download-queue.js#debridDownload"
---

TorBox's download links are on tb-cdn.st (its API's own answers in app/state/torbox.test.mjs), Premiumize's on energycdn.com. debrid_cdn in network.cpp listed only tb-cdn.io, so a TorBox download took 64 connections, drew TorBox's 429 with minutes of Retry-After and sat at 0 MB/s about a minute in. Keep both lists (network.cpp debrid_cdn and DEBRID_CDN in download-queue.js) in step when a service adds a CDN domain.
