import * as fs from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

const IGNORE_ENTRIES = ['.mayrlabs/devlink/', 'devlink.lock'];

export function gitIgnore(workingDir: string) {
  const gitignorePath = join(workingDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${IGNORE_ENTRIES.join('\n')}\n`);
    console.log(pc.green('Created .gitignore with devlink entries.'));
    return;
  }

  let content = fs.readFileSync(gitignorePath, 'utf-8');
  let added = false;
  for (const entry of IGNORE_ENTRIES) {
    if (!content.includes(entry)) {
      content += `${content.endsWith('\n') ? '' : '\n'}${entry}\n`;
      added = true;
    }
  }

  if (added) {
    fs.writeFileSync(gitignorePath, content);
    console.log(pc.green('Added devlink entries to .gitignore.'));
  } else {
    console.log(pc.yellow('Devlink entries already present in .gitignore.'));
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function gitShow(workingDir: string) {
  const gitignorePath = join(workingDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;

  let content = fs.readFileSync(gitignorePath, 'utf-8');
  let removed = false;
  for (const entry of IGNORE_ENTRIES) {
    const escapedEntry = escapeRegExp(entry);
    const regex = new RegExp(`^${escapedEntry}\\n?`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, '');
      removed = true;
    }
  }

  if (removed) {
    fs.writeFileSync(gitignorePath, content);
    console.log(pc.green('Removed devlink entries from .gitignore.'));
  } else {
    console.log(pc.yellow('Devlink entries were not ignored.'));
  }
}
