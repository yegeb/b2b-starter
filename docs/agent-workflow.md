# Agent workflow

The main agent coordinates tasks and integration. Custom Codex roles live in
`.codex/agents/`. Start a new Codex session after adding these definitions.
Project configuration requires a trusted project. The current session may not
load new role definitions immediately.

| Role | Responsibility |
| --- | --- |
| `backend` | Medusa API routes, workflows, modules, migrations, and backend tests |
| `frontend` | Next.js UI, data access, accessibility, and frontend checks |
| `infrastructure` | GCP, Kubernetes, functions, deployment files, and architecture documentation |
| `planner` | Research, implementation plans, dependencies, and verification criteria |
| `reviewer` | Independent review and audit of code, plans, architecture, and verification |

Use parallel agents only for independent tasks. Define each task's outcome,
file ownership, interface requirements, and checks before delegation. Use one
agent for a small task. Serialize changes to shared interfaces and the lockfile.

For CMPE 48A work, include the roadmap task ID, brief, and verification criteria
in the assignment. See the [implementation roadmap](project/implementation-plan/README.md).
If the brief is absent from the agent's base, provide the relevant section.
Identify the revision or working tree that supplied it.

## Separate worktrees

Create one branch and worktree for each agent task. First fetch the remote
`main` branch. Confirm the selected base is the updated `main` commit. The
example uses `origin`. Replace it with the remote for the target repository.

```sh
git fetch origin main
python3 scripts/agent_worktree.py backend quote-approval --type feat --base origin/main
```

The script creates `.worktrees/backend-quote-approval` and
`feat/backend-quote-approval`. Without `--base`, it starts from committed `HEAD`.
Do not use the default unless `HEAD` is the updated `main` commit. Merge any
shared setup into `main` before creating task branches that require it.
The script refuses existing branch names and paths through Git's checks.

Start the agent in that directory. Include the absolute worktree path and
branch in its task. Check `git worktree list` before delegation. Do not start
two agents in the same worktree. Role definitions alone do not create or
isolate worktrees. If the client cannot assign a separate working directory,
use a separate Codex session in the worktree or perform the tasks sequentially.

Worktrees share Git history and configuration. They do not isolate services,
credentials, ports, or databases. Assign separate ports and disposable test
databases to concurrent agents. Keep Redis keys separate or use separate test
instances. Do not copy shared cloud credentials into agent worktrees.

Each agent reports its branch, commit, changed files, checks, and remaining
risks. The coordinator reviews changes before integration. Human partner
review remains required for the pull request. Remove a worktree only after
checking that it contains no work that must be preserved.

## Writing

Read `.agents/skills/asd-ste100/SKILL.md` before technical writing. Use strict
mode for procedures and agent instructions. Use its prose mode for reports
and pull requests. Keep necessary technical terms. Preserve uncertainty.
This skill does not certify compliance with the official ASD dictionary.
The shared copy retains its original license and attribution.

## Local Git hooks

Run this command once in each clone. Linked worktrees share this setting:

```sh
git config --local core.hooksPath .githooks
```

The hooks require Python 3 and Gitleaks 8.19 or later. The pre-commit hook scans
staged changes with Gitleaks. It blocks the commit if
the scan fails or Gitleaks is unavailable. Review findings without printing
secrets. A scan cannot detect every secret, including secrets in some binary
files. Templates must not contain secrets.

The Git hooks block commits on local `main` and pushes to remote `main`. They
also block remote branch deletion and non-fast-forward branch pushes. The hooks
check commit messages for invalid subjects and known AI co-author trailers.
They check staged changes and newly pushed commits for environment and private
key filenames. A missing remote commit also blocks the push: fetch first.
Commit messages must reference an issue number. The hook cannot check whether
the issue exists or whether it covers the work. Create or find the issue first.
Example and template environment files are allowed, so never put secrets in them.
Hooks are local safeguards. They can be bypassed and do not replace GitHub
branch protection or server-side secret scanning. They cannot prevent agents from sharing
secrets in logs, issue descriptions, network requests, or other channels.
Do not disable them to complete an agent task.

## Codex hooks

The project also defines a Codex `PreToolUse` hook in `.codex/hooks.json`.
It checks shell commands before Codex runs them. It blocks recognizable SQL
deletes, database drops and resets, Redis flushes, and volume deletion. It also
blocks common cloud and Kubernetes deletion commands and Terraform destruction.
It also blocks recognizable Git commands that discard work, such as hard resets
and forced cleans. Inspect the worktree before editing or discarding changes.
The hook blocks these commands even when the user authorizes the operation.
Ask the user to perform an authorized operation on the confirmed target.

A second hook checks `apply_patch` edits. It protects environment files except
example and template files. It also protects TypeScript migrations committed in
`HEAD` under `apps/backend/src/modules/*/migrations/`. New migration files remain
editable until committed. It does not inspect shell commands that edit files.

Trust the project in Codex. Review and trust the hook in `/hooks` in the CLI,
or use **Settings > Hooks** in the Codex app. Review changed hooks again when
Codex requests it. Start a new session if the current session does not load the
hook. Ask Codex to run `printf 'DROP DATABASE example'` as a shell command.
The hook should block it. The command is harmless if the hook does not run.
A hook that is not loaded or trusted cannot block commands. Hook errors or
timeouts may also allow a command to run. See the
[Codex hooks documentation](https://learn.chatgpt.com/docs/hooks).

Run the Codex hook regression checks with:

```sh
python3 -m unittest discover -s tests -p 'test_agent_guards.py'
```

The command hook checks text, not the actions of a program after it starts.
Scripts, indirect commands, other tools, and unrecognized syntax can bypass its
checks. It can also block harmless text that matches a rule. It does not check
MCP calls. It does not replace database grants, IAM, or environment isolation.

## Data and cloud safeguards

- Use disposable local databases for development and tests. Check the target
  before migrations or seed commands. Tests must never target shared project data.
- Do not run database deletion, schema resets, Redis flushes, volume deletion,
  or cloud destruction without an explicit user request for that operation and target.
- Never treat a migration command as permission to reset a database. Generate
  new migrations and review them before applying them to shared environments.
- Keep credentials outside Git. Use a restricted runtime database role.
  It should not own the database or have superuser or database creation rights.
  Keep migration credentials separate. Some integration tests need database
  creation rights. Give those rights only on a disposable local test instance.
- Restrict cloud access to the permissions needed for the task. Review a plan
  before infrastructure changes. Deployments and deletions need user authorization.
