---
title: "MyLuxy's code survives on git.catkin.dev"
author: Claude
date: 2026-11-01
branch: claude/gifted-ramanujan-kuspln
id: l-77d0772f
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/mirror-catkin.yml"
  - app/state/downloads.js
  - app/state/download-queue.js
---

## Decided
git.catkin.dev/thirdparty/overdrive mirrors MyLuxy/overdrive (main up to 4bbcbee7, 2026-10-27, plus a catalog branch). overdrive-deps and ps5-homebrew-ui are not public there. Fetch it with .github/workflows/mirror-catkin.yml: it bundles what main lacks to the mirror-catkin prerelease.
Upstream's catalog-torbox.js / catalog-realdebrid.js stay unwired: downloads.js keeps the TorBox -> Premiumize -> Real-Debrid -> 2Captcha chain, because it already converts catalog hosts and covers Premiumize and captchas, which upstream's does not.

## Watch out
Cloud sessions cannot reach git.catkin.dev (proxy 403), and a branch push of upstream's history from Actions is refused because it touches workflow files: use the bundle.
