---
title: Nightly catalog failed on a constant upstream dropped
author: Claude
date: 2026-11-07
branch: claude/gifted-ramanujan-kuspln
id: l-d8d6a120
scope: repo
status: active
src: agent
touches:
  - tools/enrich-catalog.py
  - ".github/workflows/test.yml"
---

## Decided
catalog.yml failed every night from 2026-11-04 with NameError ANDSHREW in tools/enrich-catalog.py: MyLuxy/overdrive a2e5a2de removed the constant while load_titles still reads it. Restored it, and test.yml now runs pyflakes on tools/*.py so an undefined name fails the pull request instead of the nightly job.

## Watch out
A merge from upstream can pass every app test and the build yet break catalog.yml, which runs only on schedule: check its next run after merging upstream Python tools.
