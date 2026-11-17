#!/usr/bin/env python3
"""Create a unique worktree for an agent task. Never remove existing worktrees."""
import argparse
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('role', choices=['backend', 'frontend', 'infrastructure', 'reviewer'])
parser.add_argument('task', help='Unique lowercase task name, such as quote-approval')
parser.add_argument('--type', default='chore', choices=['feat', 'fix', 'docs', 'test', 'refactor', 'infra', 'ci', 'chore'])
parser.add_argument('--base', default='HEAD', help='Starting commit. Defaults to the current committed HEAD.')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.task):
    parser.error('Use lowercase words separated by hyphens for the task.')
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
branch = f'{args.type}/{args.role}-{args.task}'
target = root / '.worktrees' / f'{args.role}-{args.task}'
subprocess.run(['git', '-C', str(root), 'worktree', 'add', '-b', branch, str(target), args.base], check=True)
print(f'Worktree: {target}\nBranch: {branch}')
