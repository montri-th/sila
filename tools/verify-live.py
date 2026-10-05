#!/usr/bin/env python3
"""Verify published runtime asset bytes against an explicit release manifest.

This checks HTTP/status/MIME/redirect/integrity, not browser UI behavior.
Standard-library only. No Git, hosting, or deployment state is changed.
"""
import argparse
import concurrent.futures
import datetime
import gzip
import hashlib
import http.client
import json
import pathlib
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request


class VerificationError(Exception):
    pass


def validate_base_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise VerificationError("base URL must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise VerificationError("base URL must not contain credentials, query, or fragment")
    return value.rstrip("/") + "/"


def load_inputs(manifest_path, config_path):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise VerificationError("manifest files must be a nonempty array")
    workers = config.get("workers", 4)
    retries = config.get("maxTransientRetries", 2)
    if not isinstance(workers, int) or not 1 <= workers <= 4:
        raise VerificationError("workers must be between 1 and 4")
    if not isinstance(retries, int) or not 0 <= retries <= 2:
        raise VerificationError("transient retries must be between 0 and 2")
    if not 0 < config.get("timeoutSeconds", 30) <= 60:
        raise VerificationError("timeoutSeconds must be greater than 0 and at most 60")
    seen, normalized, skipped = set(), [], []
    for item in files:
        if not isinstance(item, dict):
            raise VerificationError("manifest file entries must be objects")
        path = item.get("path")
        if not isinstance(path, str) or not path or path.startswith("/") or "\\" in path:
            raise VerificationError("manifest path must be a nonempty relative POSIX path")
        if any(segment in ("", ".", "..") for segment in path.split("/")):
            raise VerificationError("manifest path contains an unsafe segment")
        if path in seen:
            raise VerificationError("manifest contains a duplicate file path")
        seen.add(path)
        if config.get("skipManifestSelf", True) and path == manifest_path.name:
            skipped.append({"path": path, "reason": "manifest self excluded"})
            continue
        expected_sha = item.get("sha256", "")
        expected_bytes = item.get("bytes")
        if not isinstance(expected_sha, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha):
            raise VerificationError("manifest file SHA-256 must contain 64 hexadecimal characters")
        if not isinstance(expected_bytes, int) or isinstance(expected_bytes, bool) or expected_bytes < 0:
            raise VerificationError("manifest byte count must be a nonnegative integer")
        mime_types = item.get("mimeTypes")
        if mime_types is None:
            mime_types = config["allowedMimeTypesByExtension"].get(pathlib.PurePosixPath(path).suffix.lower())
        if not isinstance(mime_types, list) or not mime_types or not all(isinstance(m, str) and "/" in m for m in mime_types):
            raise VerificationError("each runtime file requires explicit allowed MIME types")
        normalized.append({"path": path, "sha256": expected_sha.lower(), "bytes": expected_bytes,
                           "mimeTypes": [m.lower().split(";", 1)[0].strip() for m in mime_types]})
    if not normalized:
        raise VerificationError("manifest contains no runtime files after exclusions")
    return config, normalized, skipped, hashlib.sha256(manifest_bytes).hexdigest()


def verify_file(item, base_url, config):
    requested_url = urllib.parse.urljoin(base_url, urllib.parse.quote(item["path"], safe="/"))
    result = {"path": item["path"], "requestedUrl": requested_url, "expectedSha256": item["sha256"],
              "expectedBytes": item["bytes"], "allowedMimeTypes": item["mimeTypes"],
              "attempts": [], "pass": False}
    transient_statuses = set(config["transientHttpStatuses"])
    max_attempts = 1 + config.get("maxTransientRetries", 2)
    delays = config.get("retryDelaySeconds", [1, 2])
    started = time.monotonic()
    for attempt in range(1, max_attempts + 1):
        attempt_info = {"attempt": attempt, "transient": False}
        retry = False
        try:
            request = urllib.request.Request(requested_url, headers={
                "User-Agent": "Sila-Release-Byte-Verifier/1.0",
                "Accept-Encoding": "identity",
            })
            with urllib.request.urlopen(request, timeout=config.get("timeoutSeconds", 30)) as response:
                status = response.status
                final_url = response.geturl()
                mime = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                encoding = response.headers.get("Content-Encoding", "identity").strip().lower()
                result.update({"httpStatus": status, "finalUrl": final_url,
                               "redirected": final_url != requested_url, "mimeType": mime,
                               "contentEncoding": encoding,
                               "contentLengthHeader": response.headers.get("Content-Length")})
                if encoding in ("", "identity"):
                    stream = response
                elif encoding == "gzip":
                    # Compare published entity bytes, not transport compression.
                    stream = gzip.GzipFile(fileobj=response)
                else:
                    raise VerificationError("unsupported HTTP Content-Encoding: " + encoding)
                digest, byte_count = hashlib.sha256(), 0
                while True:
                    chunk = stream.read(64 * 1024)
                    if not chunk:
                        break
                    byte_count += len(chunk)
                    digest.update(chunk)
                result.update({"actualBytes": byte_count, "actualSha256": digest.hexdigest()})
                checks = {"http2xx": 200 <= status < 300, "nonempty": byte_count > 0,
                          "mimeAllowed": mime in item["mimeTypes"],
                          "bytesMatch": byte_count == item["bytes"],
                          "sha256Match": digest.hexdigest() == item["sha256"]}
                result["checks"] = checks
                result["pass"] = all(checks.values())
                attempt_info["httpStatus"] = status
                attempt_info["completedBodyRead"] = True
                if not result["pass"]:
                    result["failureReasons"] = [name for name, passed in checks.items() if not passed]
        except urllib.error.HTTPError as error:
            retry = error.code in transient_statuses
            result.update({"httpStatus": error.code, "finalUrl": error.geturl(),
                           "failureReasons": ["HTTP " + str(error.code)]})
            attempt_info.update({"httpStatus": error.code, "errorType": "HTTPError", "transient": retry})
            error.close()
        except (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError,
                http.client.IncompleteRead, http.client.RemoteDisconnected) as error:
            retry = True
            result["failureReasons"] = ["transport error: " + type(error).__name__]
            attempt_info.update({"errorType": type(error).__name__, "transient": True})
        except (VerificationError, OSError, EOFError) as error:
            # MIME/integrity/unsupported encoding errors must remain visible.
            result["failureReasons"] = [str(error)]
            attempt_info["errorType"] = type(error).__name__
        result["attempts"].append(attempt_info)
        if retry and attempt < max_attempts:
            delay = delays[min(attempt - 1, len(delays) - 1)] if delays else 0
            time.sleep(min(max(float(delay), 0), 5))
            continue
        break
    if result["pass"]:
        result.pop("failureReasons", None)
    result["elapsedSeconds"] = round(time.monotonic() - started, 3)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Exact deployed site base URL, including any repository path")
    parser.add_argument("--manifest", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "build-manifest.json")
    parser.add_argument("--config", type=pathlib.Path, default=pathlib.Path(__file__).with_name("validation-config.json"))
    parser.add_argument("--output", type=pathlib.Path, required=True, help="Caller-selected JSON evidence path")
    args = parser.parse_args()
    evidence = {"schemaVersion": "sila-live-byte-verification-1",
                "verifiedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "verificationKind": "source_and_data_bytes_not_ui_automation",
                "baseUrl": args.base_url, "manifestName": args.manifest.name, "status": "failed"}
    try:
        base_url = validate_base_url(args.base_url)
        config, files, skipped, manifest_sha = load_inputs(args.manifest, args.config)
        evidence.update({"baseUrl": base_url, "manifestSha256": manifest_sha,
                         "workers": config.get("workers", 4), "skipped": skipped})
        with concurrent.futures.ThreadPoolExecutor(max_workers=config.get("workers", 4)) as executor:
            results = list(executor.map(lambda item: verify_file(item, base_url, config), files))
        passed = sum(result["pass"] for result in results)
        evidence.update({"files": results, "summary": {"checked": len(results), "passed": passed,
                         "failed": len(results) - passed}, "status": "passed" if passed == len(results) else "failed"})
    except (VerificationError, OSError, ValueError, KeyError) as error:
        evidence["inputError"] = type(error).__name__ + ": " + str(error)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": evidence["status"], "summary": evidence.get("summary"),
                      "evidenceFile": args.output.name}, ensure_ascii=False))
    return 0 if evidence["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
