"""Hermetic packaging checks; no network access, credentials, or host required."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

REPOSITORY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("manggo_pack", REPOSITORY / "pack.py")
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="manggo-package-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "build").mkdir()
        (self.root / "lib").mkdir()
        self.manifest = {
            "manifestVersion": 1,
            "id": "com.iceriny.llm",
            "version": "4.0.0-beta.1",
            "runtime": {"kind": "bun", "api": "manggo.plugin.v1", "main": "main.js"},
            "icon": "icon.svg",
            "services": [{"id": "llm", "type": "translate", "entry": "translate"}],
        }
        self.write_manifest()
        (self.root / "main.js").write_text('export const translate = () => "source";\n')
        (self.root / "build/main.js").write_text('const t=()=>"source";export{t as translate};\n')
        (self.root / "lib/helper.js").write_text('export const helper = true;\n')
        (self.root / "icon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>\n')
        (self.root / "LICENSE").write_text('Test license\n')
        self.write_build_info()

    def write_manifest(self):
        (self.root / pack.MANIFEST).write_text(json.dumps(self.manifest), encoding="utf-8")

    def write_build_info(self, **overrides):
        info = {
            "format": "esm", "minified": True, "sourcemap": False, "imports": [], "exports": ["translate"],
            "sha256": hashlib.sha256((self.root / "build/main.js").read_bytes()).hexdigest(),
            "inputs": {"main.js": hashlib.sha256((self.root / "main.js").read_bytes()).hexdigest()},
        }
        info.update(overrides)
        (self.root / "build/build-info.json").write_text(json.dumps(info), encoding="utf-8")

    def test_archive_contains_exact_four_file_allowlist(self):
        for name in (".env", "info.json", "README.md", "credentials.json", "build/main.js.map", "lib/key.json"):
            (self.root / name).write_text("PRIVATE: must not be included")
        (self.root / ".git").mkdir()
        (self.root / ".git/config").write_text("private repository configuration")
        (self.root / "tests").mkdir()
        (self.root / "tests/test.js").write_text("private fixture")
        archive_path = pack.pack_plugin(self.root)
        with zipfile.ZipFile(archive_path) as archive:
            self.assertEqual(archive.namelist(), ["LICENSE", "icon.svg", "main.js", pack.MANIFEST])
            self.assertEqual(archive.read("main.js"), (self.root / "build/main.js").read_bytes())
            self.assertNotEqual(archive.read("main.js"), (self.root / "main.js").read_bytes())
        self.assertEqual(archive_path.name, "com.iceriny.llm-4.0.0-beta.1.mplugin")

    def test_archive_is_deterministic_despite_source_metadata_changes(self):
        archive_path = pack.pack_plugin(self.root)
        first = archive_path.read_bytes()
        for name in pack.SOURCE_ALLOWLIST.values():
            os.utime(self.root / name, (1700000000, 1800000000))
            os.chmod(self.root / name, 0o700)
        self.assertEqual(pack.pack_plugin(self.root).read_bytes(), first)
        checksum = (archive_path.parent / "sha256.txt").read_text()
        self.assertEqual(checksum, f"{hashlib.sha256(first).hexdigest()}  {archive_path.name}\n")

    def test_archive_has_fixed_safe_metadata(self):
        with zipfile.ZipFile(pack.pack_plugin(self.root)) as archive:
            for entry in archive.infolist():
                self.assertEqual(entry.date_time, pack.ZIP_TIMESTAMP)
                self.assertEqual(entry.external_attr, pack.ZIP_MODE)
                self.assertEqual(entry.create_system, 3)
                self.assertEqual(entry.compress_type, zipfile.ZIP_DEFLATED)
                self.assertEqual(entry.extra, b"")
                self.assertEqual(entry.comment, b"")

    def test_missing_required_file_fails_before_creating_archive(self):
        for name in (*pack.SOURCE_ALLOWLIST.values(), "build/build-info.json"):
            with self.subTest(name=name):
                path = self.root / name
                saved = path.read_bytes()
                path.unlink()
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)
                path.write_bytes(saved)
        self.assertFalse((self.root / "dist").exists())

    def test_invalid_manifest_json_is_rejected(self):
        for contents in ("{", "[]", '"manifest"', '{"id":"one","id":"two"}'):
            with self.subTest(contents=contents):
                (self.root / pack.MANIFEST).write_text(contents)
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)

    def test_unsupported_manifest_runtime_is_rejected(self):
        for field, value in (("kind", "node"), ("api", "manggo.plugin.v2"), ("main", "lib/helper.js"), ("main", "../main.js")):
            with self.subTest(field=field, value=value):
                saved = self.manifest["runtime"][field]
                self.manifest["runtime"][field] = value
                self.write_manifest()
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)
                self.manifest["runtime"][field] = saved

    def test_unsupported_manifest_version_is_rejected(self):
        for version in (2, True, "1", None):
            with self.subTest(version=version):
                self.manifest["manifestVersion"] = version
                self.write_manifest()
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)

    def test_runtime_must_be_an_object(self):
        self.manifest["runtime"] = "bun"
        self.write_manifest()
        with self.assertRaises(pack.PackageError):
            pack.pack_plugin(self.root)

    def test_icon_must_be_the_allowlisted_path(self):
        for icon in ("../icon.svg", "/icon.svg", "lib/icon.svg", "icon\\.svg", "", None):
            with self.subTest(icon=icon):
                self.manifest["icon"] = icon
                self.write_manifest()
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)

    def test_unsafe_plugin_identity_is_rejected(self):
        for field, value in (("id", "../escape"), ("id", ""), ("id", 10), ("id", "evil/name"), ("version", "../bad"), ("version", "1.0"), ("version", 4)):
            with self.subTest(field=field, value=value):
                saved = self.manifest[field]
                self.manifest[field] = value
                self.write_manifest()
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)
                self.manifest[field] = saved

    def test_symlinked_archive_source_is_rejected(self):
        (self.root / "real-icon.svg").write_bytes((self.root / "icon.svg").read_bytes())
        (self.root / "icon.svg").unlink()
        (self.root / "icon.svg").symlink_to("real-icon.svg")
        with self.assertRaisesRegex(pack.PackageError, "Symlinks"):
            pack.pack_plugin(self.root)

    def test_symlinked_build_directory_is_rejected(self):
        (self.root / "build").rename(self.root / "real-build")
        (self.root / "build").symlink_to("real-build", target_is_directory=True)
        with self.assertRaisesRegex(pack.PackageError, "Symlinks"):
            pack.pack_plugin(self.root)

    def test_modified_bundle_is_rejected(self):
        (self.root / "build/main.js").write_text("export const different = true;")
        with self.assertRaisesRegex(pack.PackageError, "invalid or stale"):
            pack.pack_plugin(self.root)

    def test_changed_source_requires_rebuild(self):
        (self.root / "main.js").write_text("export const changed = true;")
        with self.assertRaisesRegex(pack.PackageError, "changed since build"):
            pack.pack_plugin(self.root)

    def test_empty_bundle_is_rejected(self):
        (self.root / "build/main.js").write_text("\n")
        self.write_build_info()
        with self.assertRaisesRegex(pack.PackageError, "empty"):
            pack.pack_plugin(self.root)

    def test_build_metadata_must_describe_safe_production_output(self):
        for change in ({"imports": ["external"]}, {"sourcemap": True}, {"minified": False}, {"format": "cjs"}, {"inputs": {}}, {"inputs": {"../secret.js": "hash"}}):
            with self.subTest(change=change):
                self.write_build_info(**change)
                with self.assertRaises(pack.PackageError):
                    pack.pack_plugin(self.root)

    def test_verifier_rejects_extra_and_duplicate_archive_entries(self):
        for extra in (".env", "../outside", "main.js"):
            with self.subTest(extra=extra):
                archive_path = pack.pack_plugin(self.root)
                with zipfile.ZipFile(archive_path, "a") as archive:
                    # zipfile warns about duplicates; they are intentional here.
                    import warnings
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", UserWarning)
                        archive.writestr(extra, "unexpected")
                _, sources = pack.collect_sources(self.root)
                with self.assertRaisesRegex(pack.PackageError, "allowlist"):
                    pack.verify_archive(archive_path, sources)

    def test_missing_service_export_is_rejected(self):
        self.manifest["services"][0]["entry"] = "notExported"
        self.write_manifest()
        with self.assertRaisesRegex(pack.PackageError, "not exported"):
            pack.pack_plugin(self.root)

    def test_manifest_requires_services(self):
        self.manifest["services"] = []
        self.write_manifest()
        with self.assertRaisesRegex(pack.PackageError, "at least one service"):
            pack.pack_plugin(self.root)

    def test_checksum_symlink_cannot_overwrite_another_file(self):
        (self.root / "dist").mkdir()
        target = self.root / "private.txt"
        target.write_text("must remain untouched")
        (self.root / "dist/sha256.txt").symlink_to(target)
        with self.assertRaisesRegex(pack.PackageError, "checksum through a symlink"):
            pack.pack_plugin(self.root)
        self.assertEqual(target.read_text(), "must remain untouched")
        self.assertFalse(list((self.root / "dist").glob("*.mplugin")))

    def test_verifier_rejects_wrong_contents(self):
        archive_path = pack.pack_plugin(self.root)
        _, sources = pack.collect_sources(self.root)
        sources["main.js"] = b"changed"
        with self.assertRaisesRegex(pack.PackageError, "differs from source"):
            pack.verify_archive(archive_path, sources)

    def test_verifier_rejects_non_zip_file(self):
        archive_path = self.root / "broken.mplugin"
        archive_path.write_bytes(b"not an archive")
        _, sources = pack.collect_sources(self.root)
        with self.assertRaises(pack.PackageError):
            pack.verify_archive(archive_path, sources)

    def test_cli_reports_failure_with_nonzero_exit(self):
        (self.root / pack.MANIFEST).unlink()
        result = subprocess.run([sys.executable, str(REPOSITORY / "pack.py"), "--root", str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Packaging failed", result.stderr)
        self.assertFalse((self.root / "dist").exists())

    def test_cli_build_and_verify(self):
        command = [sys.executable, str(REPOSITORY / "pack.py"), "--root", str(self.root)]
        built = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(built.returncode, 0, built.stderr)
        verified = subprocess.run(command + ["--verify"], capture_output=True, text=True)
        self.assertEqual(verified.returncode, 0, verified.stderr)
        self.assertIn("Verified:", verified.stdout)


if __name__ == "__main__":
    unittest.main()
