import { exec, execSync } from 'node:child_process';
import { join } from 'node:path';

import { copyPackageToStore } from './copy.js';
import {
  type PackageManifest,
  type PackageScripts,
  execLoudOptions,
  getPackageManager,
  getStorePackagesDir,
  readPackageManifest,
  updatePackages,
  values,
} from './index.js';
import {
  type PackageInstallation,
  readInstallationsFile,
  removeInstallations,
} from './installations.js';
import { pmRunScriptCmd } from './pm.js';

export interface PublishPackageOptions {
  workingDir: string;
  signature?: boolean;
  changed?: boolean;
  push?: boolean;
  update?: boolean;
  replace?: boolean;
  npm?: boolean;
  content?: boolean;
  private?: boolean;
  scripts?: boolean;
  devMod?: boolean;
  workspaceResolve?: boolean;
}

export const publishPackage = async (options: PublishPackageOptions) => {
  const workingDir = options.workingDir;
  const pkg = readPackageManifest(workingDir);

  if (!pkg) return;

  const pm = getPackageManager(workingDir);

  const runPmScript = (script: keyof PackageScripts) => {
    if (!options.scripts) return;
    const scriptCmd = pkg.scripts?.[script];

    if (scriptCmd) {
      console.log(`Running ${script} script: ${scriptCmd}`);
      execSync(`${pmRunScriptCmd[pm]} ${script}`, {
        cwd: workingDir,
        ...execLoudOptions,
      });
    }
  };

  if (pkg.private && !options.private) {
    console.log(
      'Will not publish package with `private: true`' +
        ' use --private flag to force publishing.',
    );
    return;
  }

  const preScripts: (keyof PackageScripts)[] = [
    'prepublish',
    'prepare',
    'prepublishOnly',
    'prepack',
    'predevlinkpublish',
  ];

  for (const script of preScripts) runPmScript(script);

  const copyRes = await copyPackageToStore(options);

  if (options.changed && !copyRes) {
    console.warn('Package content has not changed, skipping publishing.');
    return;
  }

  const postScripts: (keyof PackageScripts)[] = [
    'postdevlinkpublish',
    'postpack',
    'publish',
    'postpublish',
  ];

  for (const script of postScripts) {
    runPmScript(script);
  }

  const publishedPackageDir = join(
    getStorePackagesDir(),
    pkg.name,
    pkg.version,
  );
  const publishedPkg = readPackageManifest(publishedPackageDir);

  if (!publishedPkg) {
    throw new Error(
      `Could not read published package manifest in ${publishedPackageDir}`,
    );
  }

  console.log(
    `${publishedPkg.name}@${publishedPkg.version} published in store.`,
  );

  if (options.push) {
    const installationsConfig = readInstallationsFile();
    const installationPaths = installationsConfig[pkg.name] || [];
    const installationsToRemove: PackageInstallation[] = [];

    for (const workingDir of installationPaths) {
      console.info(`Pushing ${pkg.name}@${pkg.version} in ${workingDir}`);

      const installationsToRemoveForPkg = await updatePackages([pkg.name], {
        replace: options.replace,
        workingDir,
        update: options.update,
        noInstallationsRemove: true,
      });
      installationsToRemove.push(...installationsToRemoveForPkg);
    }
    await removeInstallations(installationsToRemove);
  }
};
