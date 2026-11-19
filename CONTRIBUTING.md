# Contributing

For agent roles, separate worktrees, local Git hooks, and data safeguards, read
[Agent workflow](docs/agent-workflow.md). Enable the hooks once per clone with
`git config --local core.hooksPath .githooks`.

## Issues

- Before starting a change, find or create a GitHub issue for it. Keep each issue focused on one
  problem or task, with a short, descriptive title, such as `Fix quote approval
  error` or `Add product image processing`.
- Choose the bug report or feature request template when applicable. For other
  work, describe the goal, relevant context, and what completing it means.
  Include reproduction steps and expected and actual behavior for bugs.
- Add relevant labels if available and assign an owner when someone starts work.
  Do not include credentials, personal data, or other secrets in an issue.
- Link related issues and pull requests. Use `Closes #123` in a pull request
  when merging it should close the issue; otherwise use a plain reference such
  as `#123`. Close an issue when the work is complete or explain why it will
  not be pursued.

## Tracking work

- Use a parent issue for a feature or project with multiple outcomes. State the
  shared goal and how to verify completion.
- Create a sub-issue for each independently deliverable workstream. Use a
  checklist for steps that belong to one deliverable. Split a step into a
  sub-issue if it needs its own owner, PR, or acceptance check.
- Link dependencies across issues. For CMPE 48A, include the roadmap task IDs
  and link the owning brief. Use the release sequence to resolve task order.
- Use labels to identify the project and area. Use milestones for delivery
  gates. When the team uses a GitHub Project, add issues and keep their status
  current there.
- Keep branches and PRs focused on a deliverable. Use separate commits for
  changes a reviewer can assess independently. Reference the owning issue in
  each commit.

## Branches

Make changes on a branch created from an up-to-date `main`. Fetch the target
repository's `main` and verify the starting commit before creating the branch.
Use a lowercase, hyphenated name with a prefix describing the work:

| Prefix | Use |
| --- | --- |
| `feat/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation |
| `test/` | Tests |
| `refactor/` | Code restructuring without an intended behavior change |
| `infra/` | Cloud and infrastructure changes |
| `ci/` | Continuous integration and automation |
| `chore/` | Maintenance and other changes |

For example: `feat/quote-approval` or `infra/gke-deployment`.

## Commits

Use a concise Conventional Commit subject: `type(scope): description`. The
scope is optional; use the branch prefixes above as types. Write the description
in the imperative, for example `fix(api): validate company membership` or
`docs: explain deployment setup`. Keep each commit focused on a coherent change.
Reference its issue in the subject or body, for example `Refs: #123`. The issue
must exist before the commit. Do not use a placeholder issue number.

Use the human contributor's configured Git identity; do not invent an identity
or add AI tools or agents as authors, co-authors, or contributors. Keep genuine
human and upstream attribution intact.

## Pull requests

1. Push your branch and open a pull request targeting this fork's `main`.
2. Use a descriptive title, preferably in the commit format, and complete the
   pull request template. Mention relevant issues and any changes needed to
   configuration or deployment.
3. Run appropriate checks for the change and report what you ran or why a check
   could not run. Keep secrets and generated files out of the pull request.
4. Check the reviewer when the PR is ready. The partner review workflow
   requests `borayilmazer` for PRs authored by `yegeb`. For drafts, it requests
   review when the PR becomes ready. Request your partner manually if the
   workflow does not add a reviewer. The author must not approve their own
   change. Address feedback and resolve conversations before merging.
5. Merge after the other person approves and the required checks, if configured,
   pass. Delete the topic branch after merging when it is no longer needed.
   The local pre-push hook blocks remote branch deletion. Use the repository
   hosting interface for remote topic branch deletion.

Both team members must have write access to review and approve each other's
pull requests. Repository administrators should configure `main` to require a
pull request and one approval, dismiss stale approvals, require conversation
resolution, apply the restrictions to administrators, and prevent force pushes
and branch deletion. With only the two team members having write access, the
required approval must come from the other person. Administrators can still
change these settings, so the team should agree not to bypass them.
