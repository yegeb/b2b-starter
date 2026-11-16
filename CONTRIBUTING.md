# Contributing

For agent roles, separate worktrees, local Git hooks, and data safeguards, read
[Agent workflow](docs/agent-workflow.md). Enable the hooks once per clone with
`git config --local core.hooksPath .githooks`.

## Issues

- Search existing issues before opening one. Keep each issue focused on one
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

## Branches

Make changes on a branch created from an up-to-date `main`. Use a lowercase,
hyphenated name with a prefix describing the work:

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
4. Request review from your partner. The author must not approve their own
   change; address feedback and resolve conversations before merging.
5. Merge after the other person approves and the required checks, if configured,
   pass. Delete the branch after merging when it is no longer needed.

Both team members must have write access to review and approve each other's
pull requests. Repository administrators should configure `main` to require a
pull request and one approval, dismiss stale approvals, require conversation
resolution, apply the restrictions to administrators, and prevent force pushes
and branch deletion. With only the two team members having write access, the
required approval must come from the other person. Administrators can still
change these settings, so the team should agree not to bypass them.
