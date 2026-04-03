import { execSync } from 'node:child_process';
import { join } from 'node:path';
import chokidar from 'chokidar';
import { copyPackageToStore } from './copy.js';
import {
  type PackageScripts,
  execLoudOptions,
  getPackageManager,
  getStorePackagesDir,
  readPackageManifest,
  updatePackages,
} from './index.js';
import {
  type PackageInstallation,
  readInstallationsFile,
  removeInstallations,
} from './installations.js';
import { pmRunScriptCmd } from './pm.js';
import { updatePackageInStore } from './store.js';

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
    return undefined;
  }

  const preScripts: (keyof PackageScripts)[] = [
    'prepublish',
    'prepare',
    'prepublishOnly',
    'prepack',
    'predevlinkpublish',
  ];

  for (const script of preScripts) runPmScript(script);

  const finalVersion = await copyPackageToStore(options);

  if (options.changed && !finalVersion) {
    console.warn('Package content has not changed, skipping publishing.');
    return undefined;
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
    finalVersion as string,
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

  updatePackageInStore(publishedPkg.name, publishedPkg.version);

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

  return finalVersion as string;
};

export const publishPackageWatch = async (options: PublishPackageOptions) => {
  const { workingDir } = options;
  console.log(`Watching for changes in ${workingDir}...`);

  let isPublishing = false;
  let pendingPublish = false;
  let debounceTimeout: NodeJS.Timeout | null = null;
  const watchOptions = { ...options, changed: options.changed ?? true };

  const runPublish = async () => {
    if (isPublishing) {
      pendingPublish = true;
      return;
    }

    isPublishing = true;
    try {
      await publishPackage(watchOptions);
    } catch (e) {
      console.error('Error during republish:', e);
    } finally {
      isPublishing = false;
      if (pendingPublish) {
        pendingPublish = false;
        await runPublish();
      }
    }
  };

  await runPublish();

  const watcher = chokidar.watch(workingDir, {
    ignored: (path: string) => {
      // Always allow the working directory itself
      if (path === workingDir || path === `${workingDir}/`) return false;

      const relativePath = path.startsWith(workingDir)
        ? path.slice(workingDir.length).replace(/^[/\\]+/, '')
        : path;

      const ignorePatterns = [
        /^node_modules[/\\]/,
        /^\.git[/\\]/,
        /^dist[/\\]/,
        /^build[/\\]/,
        /^out[/\\]/,
        /^lib[/\\]/,
        /^target[/\\]/,
        /^vendor[/\\]/,
        /^\.next[/\\]/,
        /^\.nuxt[/\\]/,
        /^\.output[/\\]/,
        /^package-lock\.json$/,
        /^pnpm-lock\.yaml$/,
        /^yarn\.lock$/,
        /^package\.json$/,
        /^devlink\.lock$/,
        /^devlink\.sig$/,
      ];

      return ignorePatterns.some((pattern) => pattern.test(relativePath));
    },
    persistent: true,
    ignoreInitial: true,
  });

  const originalClose = watcher.close.bind(watcher);
  watcher.close = async () => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    return originalClose();
  };

  watcher.on('all', async (event, path) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      console.log(`File ${path} ${event}, republishing...`);
      await runPublish();
    }, 200);
  });

  const cleanup = async () => {
    console.log('Closing watcher...');
    await watcher.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return watcher;
};
