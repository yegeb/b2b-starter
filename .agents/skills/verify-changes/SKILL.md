---
name: verify-changes
description: Verify repository changes before reporting a completed implementation or preparing a pull request. Review the diff, select meaningful checks, inspect test changes, and report evidence and gaps.
---

# Verify changes

Use this skill after implementation and before reporting completion or preparing
a pull request. Follow `AGENTS.md` and `CONTRIBUTING.md`. Respect the user's
requested scope and existing work. Do not treat this skill as permission to
deploy, change shared services, or modify external systems.

## Review the change

1. Identify the intended behavior, affected components, and acceptance criteria.
2. Check `git status` and review the relevant staged, unstaged, and untracked
   changes. For a branch or pull request, also review the diff against its
   confirmed base. Do not attribute unrelated changes to the task.
3. Compare changed tests and configuration with the base. Look for removed or
   skipped tests, weaker assertions, disabled checks, and reduced coverage of
   important behavior. Check whether each change has a justified reason.
4. Review the final diff for errors, unintended changes, and unresolved risks.
   Fix task-related problems within the authorized scope. Report other problems.

## Select and run checks

Choose checks that exercise the affected behavior and its failure paths. Run the
relevant existing suite and required project checks. Verify that tests actually
run and that the exit status indicates success. A command that finds no tests
does not prove the behavior works.

If the change needs automated regression coverage and no suitable test exists,
add a focused behavioral test. Follow the project's test conventions. Do not
add tests that only repeat the implementation. For documentation-only or other
low-impact changes, use an appropriate review or check instead when a new test
would not add meaningful coverage. Explain the choice in the report.

Consult `AGENTS.md` for current commands and test limitations. In particular,
do not count `pnpm test` as a passing suite when it runs no tests. Backend HTTP
integration tests require a disposable local PostgreSQL target. Never point tests
at shared project data. If a necessary check cannot run safely or lacks a required
dependency, report it as blocked and give the reason. Do not claim it passed.

After fixing a finding, rerun the affected checks. Repeat the diff review if the
fix changes the scope. Do not run unrelated suites without a reason.

## Report

Report **PASS** only when the required checks pass and no material finding is
unresolved. Report **FAIL** for a failing check or unresolved material defect.
Report **BLOCKED** when a required check cannot run and its result is unknown.
If multiple statuses apply, report each with its scope.

Include the exact commands, results, and relevant file paths or concise output.
State which behavior each check covers. Describe any weakened tests, justified
test changes, untested behavior, and remaining risks. Do not include secrets or
claim checks ran when they did not. Include the same evidence in the pull
request when one is requested.
