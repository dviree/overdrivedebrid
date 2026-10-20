// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>
namespace archives {
// Reads the archive headers before libarchive does and returns why the archive must be refused, or an
// empty string when its declared decoder windows fit the console's memory budget.
std::string preflight(const std::vector<std::string>& sources);
// The same, and for a 7z whose headers could be read, the decoder memory its folders declare (the largest,
// as they decode one at a time) in `seven_zip_memory`, 0 otherwise: a 7z refused for memory alone can go to
// rar-extract, which has the console's memory rather than the app's heap.
std::string preflight(const std::vector<std::string>& sources, std::uint64_t& seven_zip_memory);
// `title`: the title id a PKG's content id names (its header's "UP0001-CUSA01234_00-..." at 0x40),
// so the app can tell another game's file from the one chosen before it has all downloaded.
struct Inspection { std::string kind, refusal, title{}; };
// What the leading bytes of the ordered volumes are ("rar", "7z", "zip", "tar", "tar.gz", "tar.bz2",
// "tar.xz", "tar.zst", "pkg", "exfat", "ffpkg", "ffpfs", "ffpfsc" or empty), and for an archive, a
// refusal its headers read so far already justify. Works on a partial download, holes included.
// For a RAR, the walk reads at least the first file header, then stops once a header starts past
// `inspect_budget` (100 ms; tests change it).
Inspection inspect(const std::vector<std::string>& sources);
extern std::chrono::milliseconds inspect_budget;
}
