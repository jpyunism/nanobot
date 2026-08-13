#!/usr/bin/env python3
"""Sync webui/package.json version to match pyproject.toml (the canonical semver source).

Usage:
    python scripts/sync_versions.py          # write: sync package.json to pyproject.toml
    python scripts/sync_versions.py --check  # exit 1 if they diverge (for pre-commit/CI)

Exits non-zero on divergence when --check is set. Idempotent when writing.
"""
from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYPROJECT = ROOT / "pyproject.toml"
PACKAGE_JSON = ROOT / "webui" / "package.json"


def read_pyproject_version() -> str:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    version = data.get("project", {}).get("version")
    if not version:
        raise SystemExit(f"scripts/sync_versions.py: no version found in {PYPROJECT}")
    return version


def read_package_json_version() -> str:
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    return data.get("version", "")


def write_package_json_version(version: str) -> None:
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    if data.get("version") == version:
        return
    data["version"] = version
    PACKAGE_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync webui/package.json to pyproject.toml semver.")
    parser.add_argument("--check", action="store_true", help="fail if versions diverge; do not write")
    args = parser.parse_args()

    py_version = read_pyproject_version()
    pkg_version = read_package_json_version()

    if pkg_version == py_version:
        return 0

    if args.check:
        print(
            f"scripts/sync_versions.py: version mismatch — "
            f"pyproject.toml={py_version} vs webui/package.json={pkg_version}",
            file=sys.stderr,
        )
        print("Run `python scripts/sync_versions.py` to fix.", file=sys.stderr)
        return 1

    write_package_json_version(py_version)
    print(f"scripts/sync_versions.py: synced webui/package.json -> {py_version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
