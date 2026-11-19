"""Run Codex checks for files changed by this tool call or turn."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import quote


SOURCE_SUFFIXES = {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"}
APPS = ("apps/backend", "apps/storefront")
HTTP = "integration-tests/http/"


def git(root, *args):
    return subprocess.check_output(["git", "-C", root, *args])


def is_code(path):
    return (
        path.startswith(tuple(app + "/" for app in APPS))
        and Path(path).suffix in SOURCE_SUFFIXES
    )


def snapshot(root, head):
    paths = git(root, "diff", "--name-only", "--no-renames", "-z", head, "--", *APPS)
    paths += git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", *APPS)
    result = {}
    for name in set(os.fsdecode(paths).split("\0")):
        if not is_code(name):
            continue
        path = Path(root, name)
        if path.is_symlink():
            result[name] = "link:" + os.readlink(path)
        elif path.is_file():
            result[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        else:
            result[name] = None
    return result


def changed(before, after):
    return sorted(
        name for name in before.keys() | after.keys()
        if before.get(name, "at baseline") != after.get(name, "at baseline")
    )


def state_path(root, event, key):
    # Include the checkout path so linked worktrees keep separate state.
    identity = json.dumps([root, event["session_id"], event["turn_id"], key])
    digest = hashlib.sha256(identity.encode()).hexdigest()
    directory = Path(tempfile.gettempdir(), f"b2b-codex-checks-{os.getuid()}")
    directory.mkdir(mode=0o700, exist_ok=True)
    return directory / digest


def save(path, data, *, first=False):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as file:
        temp = Path(file.name)
        try:
            json.dump(data, file)
            file.close()
            if first:
                try:
                    os.link(temp, path)  # Publish a complete snapshot for parallel tools.
                except FileExistsError:
                    pass
            else:
                temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)


def run_check(label, command, cwd, *, env=None, timeout=45, secrets=()):
    try:
        result = subprocess.run(
            command, cwd=cwd, env=env, timeout=timeout, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return f"{label} could not run. {error}"
    if result.returncode:
        output = result.stdout
        for secret in secrets:
            if secret:
                output = output.replace(secret, "[redacted]")
        return f"{label} failed (exit {result.returncode}).\n{output[-3500:]}"
    return None


def check_files(root, paths):
    failures = []
    for app in APPS:
        files = [
            path.removeprefix(app + "/") for path in paths
            if path.startswith(app + "/") and Path(root, path).is_file()
            and not Path(root, path).is_symlink()
        ]
        if not files:
            continue
        cwd = Path(root, app)
        failures.extend(filter(None, (
            run_check(f"{app} ESLint", [
                "pnpm", "exec", "eslint", "--", *(f"./{file}" for file in files),
            ], cwd, timeout=20),
            run_check(f"{app} TypeScript", [
                "node", str(Path(__file__).with_name("check_types.cjs")), *files,
            ], cwd, timeout=30),
        )))
    return failures


def related_http_specs(backend, paths):
    suites = {
        path.relative_to(backend).as_posix()
        for path in (backend / HTTP).rglob("*")
        if path.name.endswith((".spec.ts", ".spec.js"))
    }
    selected = set()
    for path in paths:
        if not path.startswith("apps/backend/"):
            continue
        path = path.removeprefix("apps/backend/")
        if path.startswith(HTTP) and path.endswith((".spec.ts", ".spec.js")):
            selected.update(suites & {path})
        elif path.startswith(("src/admin/", "eslint.config.")):
            continue
        elif path.startswith((
            "src/api/admin/quotes/", "src/api/store/quotes/",
            "src/modules/quote/", "src/workflows/quote/",
        )):
            selected.update(s for s in suites if "/quotes/" in s)
        elif path.startswith("src/api/store/companies/"):
            selected.update(s for s in suites if "/companies/" in s)
        else:
            # Shared server code and fixtures can affect each HTTP suite.
            selected.update(suites)
    return sorted(selected)


def check_tests(root, paths):
    backend = Path(root, APPS[0])
    suites = related_http_specs(backend, paths)
    if not suites:
        return None
    port = os.environ.get("CODEX_TEST_DB_PORT", "")
    user = os.environ.get("CODEX_TEST_DB_USER", "")
    if not port.isascii() or not port.isdecimal() or len(port) > 5 or not 1 <= int(port) <= 65535 or not user:
        return (
            "Related HTTP tests did not run. Set CODEX_TEST_DB_PORT and CODEX_TEST_DB_USER "
            "for a disposable local PostgreSQL instance before starting Codex."
        )
    password = os.environ.get("CODEX_TEST_DB_PASSWORD", "")
    env = dict(os.environ, NODE_ENV="test", DB_HOST="localhost", DB_PORT=port,
               DB_USERNAME=user, DB_PASSWORD=password,
               DATABASE_URL=f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@localhost:{port}/postgres")
    return run_check("Related HTTP tests", [
        "pnpm", "run", "test:integration:http", "--runTestsByPath", *suites,
    ], backend, env=env, timeout=260, secrets=(password, quote(password, safe="")))


def main():
    mode = sys.argv[1]
    event = json.load(sys.stdin)
    root = os.fsdecode(git(event["cwd"], "rev-parse", "--show-toplevel")).rstrip("\n")
    turn = state_path(root, event, "turn")

    if mode == "before":
        head = json.loads(turn.read_text())["head"] if turn.exists() else (
            git(root, "rev-parse", "HEAD").decode().strip()
        )
        files = snapshot(root, head)
        save(turn, {"head": head, "files": files}, first=True)
        save(state_path(root, event, event["tool_use_id"]), {"head": head, "files": files})
    elif mode == "after":
        tool = state_path(root, event, event["tool_use_id"])
        if tool.exists():
            baseline = json.loads(tool.read_text())
            tool.unlink()
            problems = check_files(root, changed(baseline["files"], snapshot(root, baseline["head"])))
            if problems:
                print(json.dumps({"hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": "\n\n".join(problems),
                }}))
    elif mode == "stop" and turn.exists():
        baseline = json.loads(turn.read_text())
        turn.unlink()
        problem = check_tests(root, changed(baseline["files"], snapshot(root, baseline["head"])))
        if problem:
            if event.get("stop_hook_active"):
                print(json.dumps({"systemMessage": problem}))
            else:
                print(json.dumps({"decision": "block", "reason": (
                    problem + "\nFix failures caused by this change. "
                    "If verification is blocked, report the blocker and finish."
                )}))


if __name__ == "__main__":
    main()
