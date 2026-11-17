#!/usr/bin/env python3
"""Protect environment files and committed Medusa migration files."""

import json
from pathlib import Path
import re
import subprocess
import sys


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))


def main():
    try:
        payload = json.load(sys.stdin)
        patch = payload["tool_input"]["command"]
        cwd = Path(payload["cwd"])
        if not isinstance(patch, str):
            raise ValueError("patch is not a string")
        root = Path(subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], cwd=cwd, text=True
        ).strip()).resolve()
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError):
        print("Cannot inspect the patch. Check the hook input and Git root.", file=sys.stderr)
        return 2

    headers = re.findall(r"^\*\*\* (Update File|Delete File|Add File|Move to): (.+)$", patch, re.MULTILINE)
    if not headers:
        print("Cannot identify patch paths.", file=sys.stderr)
        return 2
    for operation, name in headers:
        path = Path(name)
        full_path = (cwd / path).resolve() if not path.is_absolute() else path.resolve()
        basename = full_path.name
        if (basename == ".env" or basename.startswith(".env.")) and basename not in {
            ".env.template", ".env.example", ".env.sample"
        }:
            deny("Environment files are protected. Use an example or template without secrets.")
            return 0
        try:
            relative = full_path.relative_to(root).as_posix()
        except ValueError:
            continue
        if re.fullmatch(r"apps/backend/src/modules/[^/]+/migrations/[^/]+\.ts", relative):
            tracked = subprocess.run(
                ["git", "cat-file", "-e", f"HEAD:{relative}"], cwd=root,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            ).returncode == 0
            if tracked:
                deny("A committed migration is protected. Generate a new migration instead.")
                return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
