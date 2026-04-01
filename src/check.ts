import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { join } from 'node:path';
import * as fs from 'fs-extra';
import { type PackageManifest, execLoudOptions, values } from '.';

export type CheckOptions = {
  workingDir: string;
  all?: boolean;
  commit?: boolean;
};

const stagedChangesCmd = 'git diff --cached --name-only';

const isPackageManifest = (fileName: string) =>
  path.basename(fileName) === 'package.json';

export function checkManifest(options: CheckOptions) {
  const findLocalDepsInManifest = (manifestPath: string) => {
    const pkg = fs.readJSONSync(manifestPath) as PackageManifest;
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
    execSync(stagedChangesCmd, {
      cwd: options.workingDir,
      ...execLoudOptions,
    })
      .toString()
      .trim();
    execSync(stagedChangesCmd, {
      cwd: options.workingDir,
      ...execLoudOptions,
    })
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
