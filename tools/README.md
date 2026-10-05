# Published-file verification

After the exact deployment URL is available, run from the repository root:

```sh
python3 tools/verify-live.py --base-url "$DEPLOYED_SITE_URL" --output qa/live-byte-verification.json
```

The default input is `build-manifest.json`; use `--manifest` or `--config` to select another explicit file. Manifest entries use `{"path":"app.js","sha256":"<64 hex characters>","bytes":123,"mimeTypes":["application/javascript","text/javascript"]}`. If an entry omits `mimeTypes`, the extension policy in `validation-config.json` applies.

The verifier fetches every listed runtime file, excluding the manifest itself. It records 2xx status, final URL after redirects, MIME, nonempty response, exact SHA-256 and byte length. It uses four concurrent workers and retries transient HTTP/transport errors at most twice. Integrity/MIME failures are reported without silent retries. Optional gzip transport is decoded before comparing entity bytes. Missing or failed files produce a failed evidence report and a nonzero exit status.

This proves published source/data byte delivery for that manifest. It does not replace browser interaction, accessibility, visual, or municipal data-accuracy checks. No credentials, Git state, repository settings or deployment settings are changed.
