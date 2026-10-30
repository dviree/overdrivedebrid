---
title: Stall restarts and debrid connections
author: Claude
date: 2026-10-30
branch: claude/gifted-ramanujan-kuspln
cost: { minutes: 123, tokens: 2903585 }
id: l-468c1915
scope: repo
status: active
src: agent
touches:
  - "app/state/download-queue.js#stallWatch"
---

stallWatch runs on every engine snapshot (Service::poll reports each job every 250 ms; a transfer's state is only connecting or downloading), so a stuck download is seen. Debrid restarts halve connections 8,4,2,1 (a restart with as many draws the same 429), other hosts restart after twice the stall time down to 8 connections. A FileKeeper source a debrid service took is not FileKeeper's gateway: its 12 s quick relink must not apply. Ruled out: restarting at the same connection count.
