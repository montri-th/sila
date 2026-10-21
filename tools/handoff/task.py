#!/usr/bin/env python3
"""Print one task of docs/handoff/implementation-plan.json as a brief to paste into an AI coding agent.

Usage (repository root):
    python3 tools/handoff/task.py            # list tasks with status and what they wait for
    python3 tools/handoff/task.py R-10       # the full brief for one task
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    with open(os.path.join(ROOT, "docs", "handoff", "implementation-plan.json"), encoding="utf-8") as f:
        plan = json.load(f)
    tasks = {t["id"]: t for t in plan["tasks"]}
    decisions = {d["id"]: d for d in plan["decision"]["ownerDecisions"]}
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return
    if len(sys.argv) < 2:
        for t in plan["tasks"]:
            wait = [t["ownerDecision"]] if t["ownerDecision"] and decisions[t["ownerDecision"]]["status"] == "open" else []
            wait = ",".join(wait + t.get("waitsFor", []))
            print(f"{t['id']:5} {t['status']:8} {t['priority']:6} {wait:11} {t['title']['en']}")
        return
    t = tasks.get(sys.argv[1])
    if not t:
        sys.exit(f"unknown task {sys.argv[1]}; run without arguments to list tasks")
    d = decisions.get(t["ownerDecision"]) if t["ownerDecision"] else None
    out = [f"# {t['id']} · {t['title']['en']}", ""]
    if d and d["status"] == "open":
        out += [f"STOP: owner decision {d['id']} is still open ({d['question']}). Do not start.", ""]
    if t.get("waitsFor"):
        out += [f"WAIT: needs {', '.join(t['waitsFor'])} (see dataRequests in docs/handoff/handoff.json) before it can start.", ""]
    out += [t["prompt"], ""]
    out += ["Read first: " + ", ".join(t["readFirst"]), "Related files: " + ", ".join(t["repoPaths"])]
    if t.get("creates"):
        out.append("Creates: " + ", ".join(t["creates"]))
    out += ["", "Steps:"] + [f"{n}. {s}" for n, s in enumerate(t["steps"], 1)]
    out += ["", "Acceptance:"] + [f"- {a}" for a in t["acceptance"]]
    out += ["", "Verify:"] + [f"    {v}" for v in t["verify"]]
    out += ["", "Do not:"] + [f"- {x}" for x in t["doNot"]]
    print("\n".join(out))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:  # output piped into head or similar
        sys.stderr.close()
