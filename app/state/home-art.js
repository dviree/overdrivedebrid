// The home screen's pictures for this app. ShadowMount+ copies a title's sce_sys only when it first
// registers the title, so an update's new pictures would never show. Once per build (its sce_sys files'
// names, sizes and times) the app brings those copies up to date itself, as ProsperoEden's updater does:
// every file of its sce_sys into the registered folders that exist, and the icon beside the registered app.

import { FileSystem, Platform } from '@ps5-react/core';

  var TITLE = "PPSA99058";
  var REGISTERED_APP = `/user/app/${TITLE}`;
  var FOLDERS = [`/user/appmeta/${TITLE}`, `${REGISTERED_APP}/sce_sys`];
  var MARKER = `/data/ps5-react/${TITLE}/home-art.json`;
  function refreshHomeArt() {
    if (Platform.OS !== "ps5") return;
    const source = `${FileSystem.appDir}/sce_sys`;
    let files = [];
    try {
      files = FileSystem.readDir(source).filter((entry) => entry.isFile);
    } catch (error) {
      console.log(`[home-art] ${source} not read: ${error.message}`);
      return;
    }
    const build = files.map((entry) => `${entry.name}:${entry.size}:${entry.modified}`).sort().join("|");
    try {
      if (JSON.parse(FileSystem.readFile(MARKER)).build === build) return;
    } catch {
    }
    const names = files.map((entry) => entry.name);
    const copies = [];
    for (const folder of FOLDERS)
      if (FileSystem.stat(folder)?.isDirectory) for (const name of names) copies.push([`${source}/${name}`, `${folder}/${name}`]);
    if (FileSystem.stat(`${REGISTERED_APP}/icon0.png`)?.isFile) copies.push([`${source}/icon0.png`, `${REGISTERED_APP}/icon0.png`]);
    let copied = 0;
    for (const [from, to] of copies) {
      try {
        FileSystem.copyFile(from, to);
        copied++;
      } catch (error) {
        console.log(`[home-art] ${error.message}`);
      }
    }
    console.log(`[home-art] ${copied} of ${copies.length} files brought up to date for this build`);
    // Written even when a copy failed: one try per build, not one per launch.
    try {
      FileSystem.writeFile(MARKER, JSON.stringify({ build, copied }));
    } catch (error) {
      console.log(`[home-art] ${MARKER} not written: ${error.message}`);
    }
  }

export { refreshHomeArt };
