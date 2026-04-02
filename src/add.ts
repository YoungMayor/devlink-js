import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join, relative } from 'node:path';
import {
  execLoudOptions,
  getPackageStoreDir,
  parsePackageName,
  readPackageManifest,
  readSignatureFile,
  runPmUpdate,
  values,
  writePackageManifest,
} from './index.js';
import { addInstallations } from './installations.js';
import { addPackageToLockfile, readLockfile } from './lockfile.js';
import type { PackageScripts } from './pkg.js';
import { getPackageManager, pmRunScriptCmd } from './pm.js';
import { decrementInstallation, incrementInstallation } from './store.js';
import { copyDirSafe } from './sync-dir.js';

const ensureSymlinkSync = (
  src: string,
  dest: string,
  type?: fs.symlink.Type,
) => {
  const dir = join(dest, '..');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    fs.symlinkSync(src, dest, type);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'EEXIST') {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.symlinkSync(src, dest, type);
    } else throw e;
  }
};

export interface AddPackagesOptions {
  dev?: boolean;
  link?: boolean;
  linkDep?: boolean;
  replace?: boolean;
  update?: boolean;
  safe?: boolean;
  pure?: boolean;
  restore?: boolean;
  workspace?: boolean;
  workingDir: string;
}

const getLatestPackageVersion = (packageName: string) => {
  const dir = getPackageStoreDir(packageName);
  const versions = fs.readdirSync(dir);
  const latest = versions
    .map((version: string) => ({
      version,
      created: fs.statSync(join(dir, version)).ctime.getTime(),
    }))
    .sort(
      (a: { created: number }, b: { created: number }) => b.created - a.created,
    )
    .map((x: { version: string }) => x.version)[0];
  return latest || '';
};

const isSymlink = (path: string) => {
  try {
    return !!fs.readlinkSync(path);
  } catch (e) {
    return false;
  }
};

const checkPnpmWorkspace = (workingDir: string) => {
  return fs.existsSync(join(workingDir, 'pnpm-workspace.yaml'));
};

export const addPackages = async (
  packages: string[],
  options: AddPackagesOptions,
) => {
  if (!packages.length) return;

  const workingDir = options.workingDir;
  const localPkg = readPackageManifest(workingDir);
  let localPkgUpdated = false;

  if (!localPkg) return;

  const pm = getPackageManager(workingDir);

  const runPmScript = (script: string) => {
    const scriptCmd = localPkg.scripts?.[script as keyof PackageScripts];

    if (scriptCmd) {
      console.log(`Running ${script} script: ${scriptCmd}`);

      execSync(`${pmRunScriptCmd[pm]} ${script}`, {
        cwd: workingDir,
        ...execLoudOptions,
      });
    }
  };

  let pnpmWorkspace = false;

  pnpmWorkspace = checkPnpmWorkspace(workingDir);

  const doPure =
    options.pure === false
      ? false
      : options.pure || !!localPkg.workspaces || pnpmWorkspace;

  runPmScript('predevlink');

  const addedInstallsP = packages.map(async (packageName) => {
    runPmScript(`predevlink.${packageName}`);

    const { name, version = '' } = parsePackageName(packageName);

    if (!name) console.warn('Could not parse package name', packageName);

    const destDevlinkCopyDir = join(
      workingDir,
      values.devlinkPackagesFolder,
      name,
    );

    let versionToInstall = '';

    if (!options.restore) {
      const storedPackagePath = getPackageStoreDir(name);

      if (!fs.existsSync(storedPackagePath)) {
        console.warn(
          `Could not find package \`${name}\` in store (${storedPackagePath}), skipping.`,
        );

        return null;
      }

      versionToInstall = version || getLatestPackageVersion(name);

      const storedPackageDir = getPackageStoreDir(name, versionToInstall);

      if (!fs.existsSync(storedPackageDir)) {
        console.warn(
          `Could not find package \`${packageName}\` ${storedPackageDir}`,
          ', skipping.',
        );

        return null;
      }

      await copyDirSafe(storedPackageDir, destDevlinkCopyDir, !options.replace);
      const lockFileConfig = readLockfile({ workingDir });
      const currentLocked = lockFileConfig.packages[name];

      if (currentLocked?.version !== versionToInstall) {
        if (currentLocked?.version) {
          decrementInstallation(name, currentLocked.version);
        }
        incrementInstallation(name, versionToInstall);
      }
    } else {
      const lockFileConfig = readLockfile({ workingDir });
      versionToInstall = lockFileConfig.packages[name]?.version || '';

      console.log(
        `Restoring package \`${packageName}\` from .mayrlabs/devlink directory`,
      );
      if (!fs.existsSync(destDevlinkCopyDir)) {
        console.warn(
          `Could not find package \`${packageName}\` ${destDevlinkCopyDir}`,
          ', skipping.',
        );

        return null;
      }
    }

    const pkg = readPackageManifest(destDevlinkCopyDir);

    if (!pkg) return null;

    let replacedVersion = '';

    if (doPure) {
      if (!options.pure) {
        const defaultPureMsg =
          '--pure option will be used by default, to override use --no-pure.';
        if (localPkg.workspaces) {
          console.warn(
            `Because of \`workspaces\` enabled in this package ${defaultPureMsg}`,
          );
        } else if (pnpmWorkspace) {
          console.warn(
            `Because of \`pnpm-workspace.yaml\` exists in this package ${defaultPureMsg}`,
          );
        }
      }
      console.log(
        `${pkg.name}@${pkg.version} added to ${join(
          values.devlinkPackagesFolder,
          name,
        )} purely`,
      );
    }

    if (!doPure) {
      const destModulesDir = join(workingDir, 'node_modules', name);

      if (options.link || options.linkDep || isSymlink(destModulesDir)) {
        if (fs.existsSync(destModulesDir)) {
          fs.rmSync(destModulesDir, { recursive: true, force: true });
        }
      }

      if (options.link || options.linkDep) {
        ensureSymlinkSync(destDevlinkCopyDir, destModulesDir, 'junction');
      } else {
        await copyDirSafe(destDevlinkCopyDir, destModulesDir, !options.replace);
      }

      if (!options.link) {
        const protocol = options.linkDep ? 'link:' : 'file:';

        const localAddress = options.workspace
          ? 'workspace:*'
          : `${protocol + values.devlinkPackagesFolder}/${pkg.name}`;

        const dependencies = localPkg.dependencies || {};
        const devDependencies = localPkg.devDependencies || {};
        let depsObj = options.dev ? devDependencies : dependencies;

        if (options.dev) {
          if (dependencies[pkg.name]) {
            replacedVersion = dependencies[pkg.name];
            delete dependencies[pkg.name];
          }
        } else {
          if (!dependencies[pkg.name]) {
            if (devDependencies[pkg.name]) {
              depsObj = devDependencies;
            }
          }
        }

        if (depsObj[pkg.name] !== localAddress) {
          replacedVersion = replacedVersion || depsObj[pkg.name];

          depsObj[pkg.name] = localAddress;

          localPkg.dependencies =
            depsObj === dependencies ? dependencies : localPkg.dependencies;

          localPkg.devDependencies =
            depsObj === devDependencies
              ? devDependencies
              : localPkg.devDependencies;

          localPkgUpdated = true;
        }

        replacedVersion =
          replacedVersion === localAddress ? '' : replacedVersion;
      }

      if (pkg.bin && (options.link || options.linkDep)) {
        const binDir = join(workingDir, 'node_modules', '.bin');

        const addBinScript = (src: string, dest: string) => {
          const srcPath = join(destDevlinkCopyDir, src);
          const destPath = join(binDir, dest);
          console.log(
            'Linking bin script:',
            relative(workingDir, destDevlinkCopyDir),
            '->',
            relative(workingDir, destPath),
          );

          try {
            ensureSymlinkSync(srcPath, destPath);
            fs.chmodSync(srcPath, 0o755);
          } catch (e) {
            console.warn('Could not create bin symlink.');
            console.error(e);
          }
        };

        if (typeof pkg.bin === 'string') {
          fs.mkdirSync(binDir, { recursive: true });

          addBinScript(pkg.bin, pkg.name);
        } else if (typeof pkg.bin === 'object') {
          fs.mkdirSync(binDir, { recursive: true });

          for (const name in pkg.bin) {
            addBinScript(pkg.bin[name], name);
          }
        }
      }

      const addedAction = options.link ? 'linked' : 'added';

      console.log(
        `Package ${pkg.name}@${pkg.version} ${addedAction} ==> ${destModulesDir}`,
      );
    }

    const signature = readSignatureFile(destDevlinkCopyDir);

    runPmScript(`postdevlink.${packageName}`);

    return {
      signature,
      name,
      version: versionToInstall,
      replaced: replacedVersion,
      path: options.workingDir,
    };
  });

  const addedInstalls = (await Promise.all(addedInstallsP)).filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  if (localPkgUpdated) writePackageManifest(workingDir, localPkg);

  addPackageToLockfile(
    addedInstalls.map((i) => ({
      name: i.name,
      version: i.version,
      replaced: i.replaced,
      pure: doPure,
      workspace: options.workspace,
      file: options.workspace
        ? undefined
        : !options.link && !options.linkDep && !doPure,
      link: options.linkDep && !doPure,
      signature: i.signature,
    })),
    { workingDir: options.workingDir },
  );

  runPmScript('postdevlink');

  await addInstallations(addedInstalls);

  if (options.update) runPmUpdate(options.workingDir, packages);
};
