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
| `reviewer` | Independent review without edits or GitHub approvals |

Use parallel agents only for independent tasks. Define each task's outcome,
file ownership, interface requirements, and checks before delegation. Use one
agent for a small task. Serialize changes to shared interfaces and the lockfile.

## Separate worktrees

Create one branch and worktree for each agent task:

```sh
python3 scripts/agent_worktree.py backend quote-approval --type feat
```

The script creates `.worktrees/backend-quote-approval` and
`feat/backend-quote-approval`. It starts from committed `HEAD`. Use `--base`
to select another commit. Commit shared setup before creating worktrees.
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

The hooks require Python 3. They block commits and pushes to `main`, branch
deletion, non-fast-forward branch pushes, invalid commit subjects, known AI
co-author trailers, and environment or private key files in staged changes or
newly pushed commits. A missing remote commit also blocks the push: fetch first.
Example and template environment files are allowed, so never put secrets in them.
Hooks are local safeguards. They can be bypassed and do not replace GitHub
branch protection or a secret scanner. They cannot prevent agents from sharing
secrets in logs, issue descriptions, network requests, or other channels.
Do not disable them to complete an agent task.

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

Git hooks cannot intercept arbitrary SQL or cloud API calls. These instructions
guide agents. Database grants, IAM, and environment isolation enforce access.
This setup does not modify a live database or cloud account.
