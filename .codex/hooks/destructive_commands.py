#!/usr/bin/env python3
"""Block recognizable destructive shell commands before Codex runs them."""

import json
import re
import sys


PATTERNS = (
    (r"\bdrop\s+(?:database|schema|table)\b", "SQL DROP"),
    (r"\btruncate\s+(?:table\s+)?[\w\"`]", "SQL TRUNCATE"),
    (r"\bdelete\s+from\s+", "SQL DELETE"),
    (r"\b(?:dropdb|mysqladmin\s+(?:[^;&|]*?\s)?drop)\b", "database deletion"),
    (r"\b(?:flushall|flushdb)\b", "Redis flush"),
    (r"\b(?:db:reset|db:drop|migrate:reset|schema:drop)\b", "database reset"),
    (r"\bprisma\s+(?:migrate\s+reset|db\s+push\b[^;&|]*--force-reset)\b", "Prisma reset"),
    (r"\b(?:docker|podman)\s+volume\s+(?:rm|remove|prune)\b", "volume deletion"),
    (r"\b(?:docker\s+compose|docker-compose)\b[^;&|\n]*\bdown\b[^;&|\n]*(?:--volumes\b|-(?:[a-z]*v[a-z]*)\b)", "Compose volume deletion"),
    (r"\bterraform\s+destroy\b", "Terraform destruction"),
    (r"\bterraform\s+apply\b[^;&|\n]*(?:^|\s)-destroy\b", "Terraform destruction"),
    (r"\b(?:gcloud|aws|az|kubectl|helm)\b[^;&|\n]*\b(?:delete|destroy|uninstall)\b", "cloud or cluster deletion"),
    (r"\bgit\b[^;&|\n]*\breset\s+[^;&|\n]*--hard\b", "Git hard reset"),
    (r"\bgit\b[^;&|\n]*\bclean\s+[^;&|\n]*(?:--force\b|-[a-z]*f)", "Git clean with force"),
    (r"\bgit\b[^;&|\n]*\bcheckout\s+(?:--\s+)?\.(?:\s|$|[;&|])", "Git checkout of the worktree"),
    (r"\bgit\b[^;&|\n]*\brestore\s+[^;&|\n]*--worktree\b", "Git restore of the worktree"),
    (r"\bgit\b[^;&|\n]*\brestore\s+(?![^;&|\n]*--staged\b)[^;&|\n]*(?:--\s+)?\.(?:\s|$|[;&|])", "Git restore of the worktree"),
)


def main():
    try:
        payload = json.load(sys.stdin)
        command = payload["tool_input"]["command"]
        if not isinstance(command, str):
            raise ValueError("command is not a string")
    except (ValueError, KeyError, TypeError):
        print("Cannot inspect the shell command. Check the hook input.", file=sys.stderr)
        return 2

    for pattern, label in PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    f"Blocked {label}. This guard blocks the command even with user authorization. "
                    "Ask the user to perform the authorized operation on the confirmed target."
                ),
            }}))
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
