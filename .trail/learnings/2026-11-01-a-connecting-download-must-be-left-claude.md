---
title: A connecting download must be left to wait out TorBox before it counts as stuck
author: Claude
date: 2026-11-01
branch: claude/gifted-ramanujan-kuspln
id: l-a1a4291e
scope: repo
status: active
src: agent
touches:
  - "app/state/download-queue.js#stallWatch"
  - "ps5-react/native/shared/network.cpp#retry_ceiling"
---

## Decided
stallWatch gives a transfer in state "connecting" 11/3 of the stall time (330 s) before restarting it, because in "connecting" the engine is in its probe, waiting out the host's Retry-After, up to 300 s on a debrid node. Restarting at 90 s opened a new connection TorBox still counted against the account, drew the same 429, and after STALL_RESTARTS (10) the download sat at "connecting" for good (seen: 3.2 of 127.1 GB).

## Tried and ruled out
The same 90 s stall time for connecting and downloading transfers: it fought the engine's own wait.

## Watch out
"connecting" is set in run_job before prepare(); "downloading" only once the probe passed. A stall rule that treats both alike will restart a transfer that is waiting as told.

In the code: limit in stallWatch (app/state/download-queue.js); retry_ceiling (300 s debrid, 60 s otherwise) and run_job in ps5-react/native/shared/network.cpp.
