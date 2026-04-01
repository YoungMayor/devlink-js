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

    const addresMatch = new RegExp(
      `^(file|link):(.\\/)?\\${values.devlinkPackagesFolder}\\/`,
    );

    const findDeps = (depsMap: { [name: string]: string }) =>
      Object.keys(depsMap).filter((name) => depsMap[name].match(addresMatch));

    const localDeps = findDeps(pkg.dependencies || {}).concat(
      findDeps(pkg.devDependencies || {}),
    );

    return localDeps;
  };

  if (options.commit) {
    execSync(stagedChangesCmd, { cwd: options.workingDir, ...execLoudOptions })
      .toString()
      .trim();

    execSync(stagedChangesCmd, { cwd: options.workingDir, ...execLoudOptions })
      .toString()
      .trim()
      .split('\n')
      .filter(isPackageManifest);
  }

  const manifestPath = join(options.workingDir, 'package.json');
  const localDeps = findLocalDepsInManifest(manifestPath);

  if (localDeps.length) {
    console.info('Devlink dependencies found:', localDeps);
    process.exit(1);
  }
}
