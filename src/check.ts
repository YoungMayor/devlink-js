import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { basename, join } from 'node:path';
import { type PackageManifest, execLoudOptions, values } from './index.js';

export type CheckOptions = {
  workingDir: string;
  all?: boolean;
  commit?: boolean;
};

const stagedChangesCmd = 'git diff --cached --name-only';

const isPackageManifest = (fileName: string) =>
  basename(fileName) === 'package.json';

export function checkManifest(options: CheckOptions) {
  const findLocalDepsInManifest = (manifestPath: string) => {
    const pkg = JSON.parse(
      fs.readFileSync(manifestPath, 'utf-8'),
    ) as PackageManifest;

    const escapedFolder = values.devlinkPackagesFolder.replace(/\./g, '\\.');
    const addresMatch = new RegExp(`^(file|link):(.\\/)?${escapedFolder}\\/`);

    const findDeps = (depsMap: { [name: string]: string }) =>
      Object.keys(depsMap).filter((name) => depsMap[name].match(addresMatch));

    const localDeps = findDeps(pkg.dependencies || {}).concat(
      findDeps(pkg.devDependencies || {}),
    );

    return localDeps;
  };

  const manifestsToCheck: string[] = [];

  if (options.commit) {
    const stagedFiles = execSync(stagedChangesCmd, {
      cwd: options.workingDir,
      ...execLoudOptions,
    })
      .toString()
      .trim();

    if (stagedFiles) {
      manifestsToCheck.push(
        ...stagedFiles
          .split('\n')
          .filter(isPackageManifest)
          .map((f) => join(options.workingDir, f)),
      );
    }
  } else {
    manifestsToCheck.push(join(options.workingDir, 'package.json'));
  }

  const allLocalDeps: string[] = [];

  for (const manifestPath of manifestsToCheck) {
    try {
      if (fs.existsSync(manifestPath)) {
        const localDeps = findLocalDepsInManifest(manifestPath);
        allLocalDeps.push(...localDeps);
      }
    } catch (e) {
      console.error(`Could not check manifest: ${manifestPath}`);
    }
  }

  if (allLocalDeps.length) {
    console.info('Devlink dependencies found:', [...new Set(allLocalDeps)]);
    process.exit(1);
  }
}
