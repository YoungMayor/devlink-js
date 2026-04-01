import { join } from 'node:path';
import * as fs from 'fs-extra';
import {
  type PackageInstallation,
  type PackageName,
  removeInstallations,
} from './installations';

import { readLockfile, removeLockfile, writeLockfile } from './lockfile';

import {
  parsePackageName,
  readPackageManifest,
  values,
  writePackageManifest,
} from '.';

export interface RemovePackagesOptions {
  all?: boolean;
  retreat?: boolean;
  workingDir: string;
}

const isDevlinkFileAddress = (address: string, name: string) => {
  const regExp = new RegExp(
    `file|link:${values.devlinkPackagesFolder}/${name}`,
  );
  return regExp.test(address);
};

const removeIfEmpty = (folder: string) => {
  const isEmpty = fs.existsSync(folder) && !fs.readdirSync(folder).length;
  if (isEmpty) {
    fs.removeSync(folder);
  }
  return isEmpty;
};

export const removePackages = async (
  packages: string[],
  options: RemovePackagesOptions,
) => {
  const { workingDir } = options;
  const lockFileConfig = readLockfile({ workingDir: workingDir });
  const pkg = readPackageManifest(workingDir);
  if (!pkg) return;
  let packagesToRemove: PackageName[] = [];

  if (packages.length) {
    packages.forEach((packageName) => {
      const { name, version } = parsePackageName(packageName);
      if (lockFileConfig.packages[name]) {
        if (!version || version === lockFileConfig.packages[name].version) {
          packagesToRemove.push(name);
        }
      } else {
        console.warn(
          `Package ${packageName} not found in ${values.lockfileName}, still will try to remove.`,
        );
        packagesToRemove.push(name);
      }
    });
  } else {
    if (options.all) {
      packagesToRemove = Object.keys(lockFileConfig.packages) as PackageName[];
    } else {
      console.info('Use --all option to remove all packages.');
    }
  }

  let lockfileUpdated = false;
  const removedPackagedFromManifest: string[] = [];
  packagesToRemove.forEach((name) => {
    const lockedPackage = lockFileConfig.packages[name];

    let depsWithPackage;
    if (pkg.dependencies?.[name]) {
      depsWithPackage = pkg.dependencies;
    }
    if (pkg.devDependencies?.[name]) {
      depsWithPackage = pkg.devDependencies;
    }
    if (depsWithPackage && isDevlinkFileAddress(depsWithPackage[name], name)) {
      removedPackagedFromManifest.push(name);
      if (lockedPackage?.replaced) {
        depsWithPackage[name] = lockedPackage.replaced;
      } else {
        delete depsWithPackage[name];
      }
    }
    if (!options.retreat) {
      lockfileUpdated = true;
      delete lockFileConfig.packages[name];
    } else {
      console.log(
        `Retreating package ${name} version ==>`,
        lockedPackage.replaced,
      );
    }
  });

  if (lockfileUpdated) {
    writeLockfile(lockFileConfig, { workingDir });
  }

  if (removedPackagedFromManifest.length) {
    writePackageManifest(workingDir, pkg);
  }

  const installationsToRemove: PackageInstallation[] = packagesToRemove.map(
    (name) => ({
      name,
      version: '',
      path: workingDir,
    }),
  );

  const devlinkFolder = join(workingDir, values.devlinkPackagesFolder);
  removedPackagedFromManifest.forEach((name) => {
    fs.removeSync(join(workingDir, 'node_modules', name));
  });
  packagesToRemove.forEach((name) => {
    if (!options.retreat) {
      fs.removeSync(join(devlinkFolder, name));
    }
  });

  const isScopedPackage = (name: string) => name.startsWith('@');

  packagesToRemove
    .filter(isScopedPackage)
    .map((name) => name.split('/')[0])
    .map((name) => join(devlinkFolder, name))
    .map(removeIfEmpty);

  const isEmptyLockFile = !Object.keys(lockFileConfig.packages).length;
  if (isEmptyLockFile && !options.retreat) {
    removeLockfile({ workingDir });
    if (!removeIfEmpty(devlinkFolder)) {
      console.warn(devlinkFolder, 'is not empty, not removing it.');
    }
  }

  if (!options.retreat) {
    await removeInstallations(installationsToRemove);
  }
};
