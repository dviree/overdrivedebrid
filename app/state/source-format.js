// ADDED (dviree/overdrivedebrid): a source's format by its own name, for the source list (game/sources.js).
// Kept apart from the list's code so it reads no console API and is tested on its own.

  // The format by its own name (exFAT, FPKG, PKG...), not only
  // "Game image" or "Package". Most catalog sources are listed as "binary", a format known only once
  // downloaded, yet their own label, file name or link usually says it ("Fpkg - DataNodes",
  // "game.exfat"): it is read from there. Nothing is shown when nothing says it.
  var FORMAT_NAMES = { exfat: "exFAT", ffpkg: "ffpkg", ffpfsc: "ffpfsc", ffpfs: "ffpfs", fpkg: "FPKG", pkg: "PKG", rar: "RAR", zip: "ZIP", "7z": "7z" };
  var FORMAT_WORDS = ["exfat", "ffpfsc", "ffpfs", "ffpkg", "fpkg", "pkg", "rar", "zip", "7z"];
  function formatName(release) {
    const source2 = release.parts?.[0]?.sources?.[0];
    if (source2 && release.format === "archive-set") return formatName(source2) || null;
    if (FORMAT_NAMES[release.format]) return FORMAT_NAMES[release.format];
    const text = [release.label, release.filename, release.browserUrl || release.url].filter(Boolean).join(" ").toLowerCase();
    const word = FORMAT_WORDS.find((name) => new RegExp(`(?:^|[^a-z0-9])${name}(?:$|[^a-z0-9])`).test(text));
    return word ? FORMAT_NAMES[word] : null;
  }

export { formatName };
