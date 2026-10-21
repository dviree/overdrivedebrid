#!/usr/bin/env python3
"""Write catalog-update.json: what the importers changed in app/data since the last commit.

    python -P tools/catalog-update.py --out <file> [--max-mb 8]

The nightly catalog workflow (.github/workflows/catalog.yml) runs the importers on a checkout of
main, then this: the catalog the app was built with is main's last commit, so the update holds only
what an importer changed since. It holds

    format     1
    base       the commit the update applies to (main's, the build's)
    generated  when, in UTC
    games      every catalog entry added or changed, whole, with the block it belongs in
               ({"block": "games" | "twins", "line": {...}})
    removed    the ids of the entries gone
    releases   {id: [records]} for every release file added or changed (null: removed)
    pages      {id: page} for every page file added or changed (null: removed)

An update over --max-mb stops with an error: it means the importers' changes were never folded into
main (a release does that), and the app should not download it every day.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = "app/data"
ID = re.compile(r'^\s*\{ "id": "([^"]+)"')


def git(*args):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, check=True).stdout


def entries(text):
    """{id: (block, line text)} for every catalog entry."""
    out, block = {}, None
    for line in text.split("\n"):
        opened = re.match(r"^\s*var (\w+) = \[$", line)
        if opened:
            block = opened.group(1)
            continue
        found = ID.match(line)
        if found and block in ("games", "twins"):
            out[found.group(1)] = (block, line.strip().rstrip(","))
    return out


def parse(line):
    # The bundle's \xNN escapes read as JSON's.
    return json.loads(re.sub(r"\\x([0-9a-fA-F]{2})", r"\\u00\1", line))


def changed_files(folder):
    """{id: content or None} for the files of app/data/<folder> that differ from the last commit."""
    out = {}
    status = git("status", "--porcelain", "--untracked-files=all", "--", f"{DATA}/{folder}").decode("utf-8")
    for row in status.splitlines():
        path = row[3:].strip().strip('"')
        if not path.endswith(".json"):
            continue
        name = os.path.basename(path)[:-5]
        full = os.path.join(ROOT, path)
        out[name] = json.load(open(full, encoding="utf-8")) if os.path.exists(full) else None
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-mb", type=float, default=8)
    args = parser.parse_args()
    base = git("rev-parse", "HEAD").decode().strip()
    before = entries(git("show", f"HEAD:{DATA}/catalog.js").decode("utf-8"))
    after = entries(open(os.path.join(ROOT, DATA, "catalog.js"), encoding="utf-8").read())
    games = [{"block": block, "line": parse(line)} for game_id, (block, line) in after.items() if before.get(game_id) != (block, line)]
    update = {
        "format": 1,
        "base": base,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "games": games,
        "removed": sorted(game_id for game_id in before if game_id not in after),
        "releases": changed_files("releases"),
        "pages": changed_files("pages"),
    }
    body = json.dumps(update, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    added = sum(1 for game in games if game["line"]["id"] not in before)
    print(f"update for {base[:7]}: {added} games added, {len(games) - added} changed, {len(update['removed'])} removed, "
          f"{len(update['releases'])} release files, {len(update['pages'])} pages, {len(body) / 1048576:.2f} MB")
    if len(body) > args.max_mb * 1048576:
        raise SystemExit(f"the update is over {args.max_mb} MB: fold the importers' changes into main first")
    with open(args.out, "wb") as handle:
        handle.write(body)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
