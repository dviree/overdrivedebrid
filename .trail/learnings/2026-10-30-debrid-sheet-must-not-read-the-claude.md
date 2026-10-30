---
title: Debrid sheet must not read the account on open
author: Claude
date: 2026-10-30
branch: claude/gifted-ramanujan-kuspln
cost: { minutes: 123, tokens: 2903585 }
id: l-f960f9dc
scope: repo
status: active
src: agent
touches:
  - app/ui/TorboxSheet.jsx
---

Opening Settings, Overdrive Debrid crashed the app for an account with many TorBox files: the sheet read torrents, web downloads and usenet (up to 4 MB of JSON each) and drew up to 200 rows on open, too much for the app's heap. The list is read only on 'Show your TorBox files' and capped at 40 rows. Every part renders fine in react-test-renderer, so data size was the cause, not a code error.
