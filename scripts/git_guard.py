#!/usr/bin/env python3
"""Local Git checks. Remote branch protection remains required."""
import re
import subprocess
import sys
from pathlib import Path


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def fail(message):
    sys.exit('Git guard: ' + message)


def check_files(files):
    for filename in files.split('\0'):
        name = Path(filename).name
        if name == '.env' or (name.startswith('.env.') and name not in {'.env.template', '.env.example', '.env.sample'}):
            fail('Do not commit or push environment files: ' + filename)
        if name.lower().endswith(('.pem', '.key')):
            fail('Do not commit or push private key files: ' + filename)


mode = sys.argv[1]
if mode == 'pre-push':
    for line in sys.stdin:
        fields = line.split()
        if len(fields) == 4 and fields[2] == 'refs/heads/main':
            fail('Push a topic branch and open a reviewed pull request for main.')
        if len(fields) != 4 or not fields[2].startswith('refs/heads/'):
            continue
        local_ref, local_oid, remote_ref, remote_oid = fields
        if local_ref == '(delete)' or set(local_oid) == {'0'}:
            fail('Branch deletion is blocked by the local hook: ' + remote_ref)
        if set(remote_oid) != {'0'}:
            result = subprocess.run(['git', 'merge-base', '--is-ancestor', remote_oid, local_oid])
            if result.returncode != 0:
                fail('Non-fast-forward push blocked, or remote history is missing. Fetch and check the branch.')
            revisions = [remote_oid + '..' + local_oid]
        else:
            revisions = [local_oid, '--not', '--remotes']
        commits = git('rev-list', *revisions).splitlines()
        for commit in commits:
            files = git('diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', '-z', '--diff-filter=ACMR', commit)
            check_files(files)
elif mode == 'pre-commit':
    if git('branch', '--show-current') == 'main':
        fail('Create a topic branch before committing.')
    files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
    check_files(files)
elif mode == 'commit-msg':
    message = Path(sys.argv[2]).read_text()
    subject = message.splitlines()[0] if message else ''
    if not re.fullmatch(r'(feat|fix|docs|test|refactor|infra|ci|chore)(\([a-z0-9-]+\))?!?: .+', subject):
        fail('Use type(scope): description. Scope is optional.')
    for line in message.splitlines():
        if re.match(r'(?i)^co-authored-by:', line) and re.search(r'(?i)\b(copilot|codex|claude|openai|anthropic|chatgpt|gemini)\b|\[bot\]', line):
            fail('Remove the AI co-author trailer. Preserve genuine human attribution.')
else:
    fail('Unknown hook mode.')
