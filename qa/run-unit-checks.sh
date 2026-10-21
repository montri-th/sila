#!/usr/bin/env sh
# Run every Node check in qa/ (tax engine, tax calculator, terrain, public aggregates, map pick, house points, FABDEM layer),
# then confirm qa/expected-figures.json still matches the tax engine and data/parcel-tax.json.
# Synthetic inputs or published data only; no network. Usage (repository root): sh qa/run-unit-checks.sh
# Side effect: check-fabdem-layer.cjs and check-terrain-3d.cjs rewrite their receipts (qa/revision-1.8-terrain-fixtures.json,
# qa/revision-1.9-terrain3d-fixtures.json); the bytes stay the same unless the checks themselves changed.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
# One line per check: the check's final JSON object made compact, or its last line.
summary() {
  node -e 'const t=require("fs").readFileSync(0,"utf8").trim();const i=t.lastIndexOf("\n{");let s=i>=0?t.slice(i+1):t;
try{s=JSON.stringify(JSON.parse(s))}catch(e){s=t.split("\n").pop()||""}process.stdout.write(s.slice(0,110))'
}
for f in qa/check-*.cjs; do
  if out=$(node "$f" 2>&1); then
    printf 'PASS %s  %s\n' "$f" "$(printf '%s' "$out" | summary)"
  else
    printf 'FAIL %s\n%s\n' "$f" "$(printf '%s' "$out" | tail -n 15)"
    fail=1
  fi
done
if out=$(node qa/compute-figures.cjs --check 2>&1); then
  printf 'PASS qa/compute-figures.cjs --check  %s\n' "$out"
else
  printf 'FAIL qa/compute-figures.cjs --check\n%s\n' "$out"
  fail=1
fi
if [ "$fail" -ne 0 ]; then echo "unit checks: FAIL"; exit 1; fi
echo "unit checks: PASS"
