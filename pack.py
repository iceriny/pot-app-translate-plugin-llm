#!/usr/bin/env python3
"""Build and verify reproducible, allowlisted Manggo plugin archives.

Only the manifest, a minified single-file bundle, icon, and license
are shipped. The output is a ZIP with a .mplugin extension, not a .potext file.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tempfile
import zipfile

MANIFEST = "manggo.plugin.json"
SOURCE_ALLOWLIST = {
    MANIFEST: MANIFEST,
    "main.js": "build/main.js",
    "icon.svg": "icon.svg",
    "LICENSE": "LICENSE",
}
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
ZIP_MODE = (stat.S_IFREG | 0o644) << 16
PLUGIN_ID_PATTERN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9._-]*\Z")
VERSION_PATTERN = re.compile(
    r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\Z"
)


class PackageError(ValueError):
    """The plugin source or archive failed a packaging safety check."""


def _source_file(root, relative_name):
    """Require a regular file reached without symlinks or path traversal."""
    if not isinstance(relative_name, str):
        raise PackageError(f"Unsafe source path: {relative_name!r}")
    relative = PurePosixPath(relative_name)
    if (
        not relative_name
        or "\\" in relative_name
        or relative.is_absolute()
        or any(part in ("", ".", "..") for part in relative_name.split("/"))
    ):
        raise PackageError(f"Unsafe source path: {relative_name!r}")
    path = root
    for part in relative.parts:
        path = path / part
        if path.is_symlink():
            raise PackageError(f"Symlinks are not allowed in package sources: {relative_name}")
    if not path.is_file():
        raise PackageError(f"Required file is missing or is not a regular file: {relative_name}")
    return path


def _unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise PackageError(f"Duplicate manifest field: {key}")
        result[key] = value
    return result


def read_manifest(root):
    path = _source_file(root, MANIFEST)
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_json_object)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise PackageError(f"Invalid {MANIFEST}: {error}") from error
    if not isinstance(manifest, dict):
        raise PackageError("The manifest must be a JSON object")
    if type(manifest.get("manifestVersion")) is not int or manifest["manifestVersion"] != 1:
        raise PackageError("The manifestVersion must be 1")
    runtime = manifest.get("runtime")
    if not isinstance(runtime, dict) or runtime.get("kind") != "bun":
        raise PackageError("The manifest runtime.kind must be bun")
    if runtime.get("api") != "manggo.plugin.v1":
        raise PackageError("The manifest runtime.api must be manggo.plugin.v1")
    if runtime.get("main") != "main.js":
        raise PackageError("The manifest runtime.main must reference the allowlisted main.js")
    if manifest.get("icon") != "icon.svg":
        raise PackageError("The manifest icon must reference the allowlisted icon.svg")
    _source_file(root, "build/main.js")
    _source_file(root, "icon.svg")
    plugin_id = manifest.get("id")
    version = manifest.get("version")
    if not isinstance(plugin_id, str) or not PLUGIN_ID_PATTERN.fullmatch(plugin_id):
        raise PackageError("The manifest id must be a safe, nonempty plugin identifier")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise PackageError("The manifest version must be a semantic version")
    return manifest


def collect_sources(root):
    """Map the exact archive allowlist to source files, never the source tree."""
    root = Path(root).resolve()
    manifest = read_manifest(root)
    sources = {
        name: _source_file(root, SOURCE_ALLOWLIST[name]).read_bytes()
        for name in sorted(SOURCE_ALLOWLIST)
    }
    if not sources["main.js"].strip():
        raise PackageError("The bundled entry point is empty; run npm run build")
    # The build command guarantees zero external imports and writes this digest.
    # Recheck it here so stale or modified output cannot be packaged by mistake.
    info_path = _source_file(root, "build/build-info.json")
    try:
        info = json.loads(info_path.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise PackageError(f"Invalid build metadata: {error}") from error
    expected_hash = hashlib.sha256(sources["main.js"]).hexdigest()
    if (
        not isinstance(info, dict)
        or info.get("format") != "esm"
        or info.get("minified") is not True
        or info.get("sourcemap") is not False
        or info.get("imports") != []
        or info.get("sha256") != expected_hash
    ):
        raise PackageError("Bundle metadata is invalid or stale; run npm run build")
    exports = info.get("exports")
    services = manifest.get("services")
    if not isinstance(exports, list) or not all(isinstance(name, str) for name in exports):
        raise PackageError("Build metadata must identify its exported service entries")
    if not isinstance(services, list) or not services:
        raise PackageError("The manifest must declare at least one service")
    for service in services:
        if not isinstance(service, dict) or service.get("entry") not in exports:
            raise PackageError("A manifest service entry is not exported by the bundle")
    inputs = info.get("inputs")
    if not isinstance(inputs, dict) or "main.js" not in inputs:
        raise PackageError("Build metadata must identify its source inputs")
    for name, digest in inputs.items():
        if not isinstance(name, str) or not (name == "main.js" or (name.startswith("lib/") and name.endswith(".js"))):
            raise PackageError(f"Unexpected bundle input: {name!r}")
        if hashlib.sha256(_source_file(root, name).read_bytes()).hexdigest() != digest:
            raise PackageError(f"Bundle source changed since build: {name}; run npm run build")
    return manifest, sources


def artifact_name(manifest):
    return f"{manifest['id']}-{manifest['version']}.mplugin"


def verify_archive(archive_path, sources):
    """Verify layout, contents, and deterministic ZIP metadata without extracting."""
    try:
        with zipfile.ZipFile(archive_path) as archive:
            entries = archive.infolist()
            if [item.filename for item in entries] != sorted(sources):
                raise PackageError("Archive files do not exactly match the sorted source allowlist")
            if archive.comment:
                raise PackageError("Archive must not contain a comment")
            for item in entries:
                if (
                    item.date_time != ZIP_TIMESTAMP
                    or item.create_system != 3
                    or item.external_attr != ZIP_MODE
                    or item.compress_type != zipfile.ZIP_DEFLATED
                    or item.extra
                    or item.comment
                    or item.flag_bits & 0x1
                ):
                    raise PackageError(f"Invalid deterministic ZIP metadata: {item.filename}")
                if item.file_size != len(sources[item.filename]) or archive.read(item) != sources[item.filename]:
                    raise PackageError(f"Archive content differs from source: {item.filename}")
    except (OSError, zipfile.BadZipFile, RuntimeError) as error:
        raise PackageError(f"Invalid plugin archive: {error}") from error


def pack_plugin(root, output_dir=None):
    root = Path(root).resolve()
    manifest, sources = collect_sources(root)
    output_dir = Path(output_dir) if output_dir is not None else root / "dist"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / artifact_name(manifest)
    checksum_path = output_dir / "sha256.txt"
    if checksum_path.is_symlink():
        raise PackageError("Refusing to write a checksum through a symlink")
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".manggo-", suffix=".tmp", dir=output_dir, delete=False) as temporary:
            temporary_path = Path(temporary.name)
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sources.items():
                info = zipfile.ZipInfo(name, date_time=ZIP_TIMESTAMP)
                info.create_system = 3
                info.external_attr = ZIP_MODE
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data, compresslevel=9)
        verify_archive(temporary_path, sources)
        os.replace(temporary_path, output_path)
        digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
        checksum_path.write_text(f"{digest}  {output_path.name}\n", encoding="utf-8")
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return output_path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent, help="Plugin source directory")
    parser.add_argument("--output-dir", type=Path, help="Output directory (default: <root>/dist)")
    parser.add_argument("--verify", nargs="?", const="", metavar="ARCHIVE", help="Verify an archive without writing (default: current dist artifact)")
    args = parser.parse_args(argv)
    try:
        if args.verify is not None:
            manifest, sources = collect_sources(args.root)
            output_dir = args.output_dir if args.output_dir is not None else args.root / "dist"
            archive_path = Path(args.verify) if args.verify else output_dir / artifact_name(manifest)
            verify_archive(archive_path, sources)
            print(f"Verified: {archive_path}")
        else:
            output_path = pack_plugin(args.root, args.output_dir)
            print(f"Built: {output_path} ({output_path.stat().st_size} bytes)")
    except (OSError, PackageError) as error:
        print(f"Packaging failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
