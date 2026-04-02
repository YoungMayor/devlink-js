import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import figlet from 'figlet';
import pc from 'picocolors';
import {
  addPackages,
  getPackageStoreDir,
  parsePackageName,
  publishPackage,
  readPackageManifest,
  removePackages,
  updatePackages,
} from './index.js';
import { cleanInstallations, showInstallations } from './installations.js';
import { readLockfile } from './lockfile.js';
import { publishPackageWatch } from './publish.js';
import { readStore, removePackageVersionFromStore } from './store.js';
import { updateAllPackages } from './update.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion() {
  const pkgPath = join(__dirname, '..', 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

export async function handlePublish() {
  const workingDir = process.cwd();
  const pkg = readPackageManifest(workingDir);

  if (!pkg) {
    note(pc.red('No package.json found in current directory.'), 'Error');
    return;
  }

  const useWatch = await confirm({
    message: `Do you want to publish ${pc.cyan(pkg.name)} in ${pc.yellow('watch mode')}?`,
    initialValue: false,
  });

  if (isCancel(useWatch)) return;

  const useContent = await confirm({
    message: 'Show published files list?',
    initialValue: true,
  });

  if (isCancel(useContent)) return;

  const usePush = await confirm({
    message: 'Push to all installations automatically?',
    initialValue: true,
  });

  if (isCancel(usePush)) return;

  const options = {
    workingDir,
    content: useContent,
    push: usePush,
    scripts: true,
    devMod: true,
    workspaceResolve: true,
  };

  if (useWatch) {
    await publishPackageWatch(options);
  } else {
    const s = spinner();
    s.start(`Publishing ${pkg.name}...`);
    await publishPackage(options);
    s.stop(`${pc.green(pkg.name)} published successfully!`);
  }
}

export async function handleAdd(packageName?: string) {
  const store = readStore();
  const packageNames = Object.keys(store.packages);

  if (packageNames.length === 0) {
    note(pc.yellow('Store is empty. Publish some packages first!'), 'Info');
    return;
  }

  let selectedPackage = '';
  let selectedVersion = '';

  if (packageName) {
    const parsed = parsePackageName(packageName);
    selectedPackage = parsed.name;
    selectedVersion = parsed.version;
  }

  if (!selectedPackage) {
    const selected = await select({
      message: 'Select a package to add from store:',
      options: packageNames.map((name) => ({ value: name, label: name })),
    });

    if (isCancel(selected)) return;
    selectedPackage = selected as string;
  }

  const pkgData = store.packages[selectedPackage];
  if (!pkgData) {
    note(pc.red(`Package ${selectedPackage} not found in store.`), 'Error');
    return;
  }

  const versions = Object.keys(pkgData.versions).sort((a, b) => {
    const timeA = new Date(pkgData.versions[a].publishedAt).getTime();
    const timeB = new Date(pkgData.versions[b].publishedAt).getTime();
    return timeB - timeA;
  });

  if (!selectedVersion) {
    const version = await select({
      message: `Select version for ${pc.cyan(selectedPackage)}:`,
      options: versions.map((v) => ({ value: v, label: v })),
    });

    if (isCancel(version)) return;
    selectedVersion = version as string;
  } else {
    // Validate provided version
    if (!pkgData.versions[selectedVersion]) {
      note(
        pc.red(
          `Version ${selectedVersion} of ${selectedPackage} not found in store.\n` +
            `Available versions: ${versions.join(', ')}`,
        ),
        'Error',
      );
      return;
    }
  }

  const flags = await multiselect({
    message: 'Select installation flags:',
    options: [
      { value: 'link', label: 'Link (symlink)', hint: 'fastest' },
      {
        value: 'pure',
        label: 'Pure (keep in .mayrlabs/devlink)',
        hint: 'cleaner',
      },
      { value: 'dev', label: 'Save as devDependency', hint: '-D' },
      { value: 'workspace', label: 'Workspace selection', hint: 'monorepo' },
    ],
    required: false,
  });

  if (isCancel(flags)) return;

  const s = spinner();
  s.start(`Adding ${selectedPackage}@${selectedVersion}...`);

  await addPackages([`${selectedPackage}@${selectedVersion}`], {
    workingDir: process.cwd(),
    linkDep: (flags as string[]).includes('link'),
    pure: (flags as string[]).includes('pure'),
    dev: (flags as string[]).includes('dev'),
    workspace: (flags as string[]).includes('workspace'),
  });

  s.stop(`${pc.green(selectedPackage)} added successfully!`);
}

export async function handleInstallations() {
  const action = await select({
    message: 'Manage installations:',
    options: [
      { value: 'show', label: 'Show', hint: 'view all devlinked projects' },
      { value: 'clean', label: 'Clean', hint: 'remove stale installations' },
    ],
  });

  if (isCancel(action)) return;

  if (action === 'show') {
    showInstallations({ packages: [] });
  } else {
    const dryRun = await confirm({
      message: 'Dry run?',
      initialValue: true,
    });
    if (isCancel(dryRun)) return;

    const s = spinner();
    s.start('Cleaning installations...');
    await cleanInstallations({ packages: [], dry: dryRun });
    s.stop('Clean completed.');
  }
}

export async function handleUpdate() {
  const workingDir = process.cwd();
  const lockfile = readLockfile({ workingDir });
  const linkedPackages = Object.keys(lockfile.packages);

  if (linkedPackages.length === 0) {
    note(pc.yellow('No packages are devlinked in this project.'), 'Info');
    return;
  }

  const selectedPackages = await multiselect({
    message: 'Select packages to update:',
    options: [
      { value: 'all', label: 'All packages', hint: 'update everything' },
      ...linkedPackages.map((name) => ({ value: name, label: name })),
    ],
  });

  if (isCancel(selectedPackages)) return;

  const toUpdate = (selectedPackages as string[]).includes('all')
    ? linkedPackages
    : (selectedPackages as string[]);

  const updates: string[] = [];
  const store = readStore();

  for (const pkgName of toUpdate) {
    const pkgData = store.packages[pkgName];
    if (!pkgData) {
      note(
        pc.yellow(`Package ${pkgName} not found in store, skipping.`),
        'Warning',
      );
      continue;
    }

    const versions = Object.keys(pkgData.versions).sort((a, b) => {
      const timeA = new Date(pkgData.versions[a].publishedAt).getTime();
      const timeB = new Date(pkgData.versions[b].publishedAt).getTime();
      return timeB - timeA;
    });

    const selectedVersion = await select({
      message: `Select version for ${pc.cyan(pkgName)} (currently ${lockfile.packages[pkgName].version}):`,
      options: [
        { value: 'latest', label: 'latest', hint: versions[0] },
        ...versions.map((v) => ({ value: v, label: v })),
      ],
    });

    if (isCancel(selectedVersion)) return;
    updates.push(
      `${pkgName}@${selectedVersion === 'latest' ? versions[0] : selectedVersion}`,
    );
  }

  if (updates.length > 0) {
    const s = spinner();
    s.start('Updating packages...');
    await updatePackages(updates, { workingDir, update: true });
    s.stop('Updates completed.');
  }
}

export async function handleUpdateAll() {
  const workingDir = process.cwd();
  const s = spinner();
  s.start('Updating all devlinked packages to latest...');
  await updateAllPackages(workingDir);
  s.stop('All packages updated to latest.');
}

export async function handleRetreat() {
  const workingDir = process.cwd();
  const lockfile = readLockfile({ workingDir });
  const linkedPackages = Object.keys(lockfile.packages);

  if (linkedPackages.length === 0) {
    note(pc.yellow('No packages to retreat.'), 'Info');
    return;
  }

  const selected = await multiselect({
    message: 'Select packages to retreat:',
    options: [
      { value: 'all', label: 'All packages' },
      ...linkedPackages.map((name) => ({ value: name, label: name })),
    ],
  });

  if (isCancel(selected)) return;

  const toRetreat = (selected as string[]).includes('all')
    ? []
    : (selected as string[]);
  const isAll = (selected as string[]).includes('all');

  const s = spinner();
  s.start('Retreating packages...');
  await removePackages(toRetreat, { workingDir, retreat: true, all: isAll });
  s.stop('Retreat completed.');
}

export async function handleRestore() {
  const workingDir = process.cwd();
  const s = spinner();
  s.start('Restoring retreated packages...');
  await updatePackages([], { workingDir, restore: true });
  s.stop('Restore completed.');
}

export async function handleRemove() {
  const workingDir = process.cwd();
  const lockfile = readLockfile({ workingDir });
  const linkedPackages = Object.keys(lockfile.packages);

  if (linkedPackages.length === 0) {
    note(pc.yellow('No packages to remove.'), 'Info');
    return;
  }

  const selected = await multiselect({
    message: 'Select packages to remove:',
    options: [
      { value: 'all', label: 'All packages' },
      ...linkedPackages.map((name) => ({ value: name, label: name })),
    ],
  });

  if (isCancel(selected)) return;

  const toRemove = (selected as string[]).includes('all')
    ? []
    : (selected as string[]);
  const isAll = (selected as string[]).includes('all');

  const s = spinner();
  s.start('Removing packages...');
  await removePackages(toRemove, { workingDir, all: isAll });
  s.stop('Removal completed.');
}

export async function handleStore() {
  const store = readStore();
  const packageNames = Object.keys(store.packages);

  if (packageNames.length === 0) {
    note(pc.yellow('Store is empty.'), 'Info');
    return;
  }

  const selectedPackage = await select({
    message: 'Browse Store:',
    options: packageNames.map((name) => ({ value: name, label: name })),
  });

  if (isCancel(selectedPackage)) return;

  const pkgData = store.packages[selectedPackage as string];
  const versions = Object.keys(pkgData.versions).sort().reverse();

  const action = await select({
    message: `Manage ${pc.cyan(selectedPackage as string)}:`,
    options: [
      { value: 'view', label: 'View versions' },
      { value: 'delete', label: pc.red('Delete package from store') },
    ],
  });

  if (isCancel(action)) return;

  if (action === 'view') {
    const selectedVersion = await select({
      message: 'Versions:',
      options: versions.map((v) => ({ value: v, label: v })),
    });
    if (isCancel(selectedVersion)) return;

    const vAction = await select({
      message: `${selectedPackage}@${selectedVersion}:`,
      options: [
        { value: 'info', label: 'Show info' },
        { value: 'delete', label: pc.red('Delete version') },
      ],
    });

    if (vAction === 'delete') {
      const sure = await confirm({ message: 'Are you sure?' });
      if (sure) {
        const pkgDir = getPackageStoreDir(
          selectedPackage as string,
          selectedVersion as string,
        );
        if (fs.existsSync(pkgDir)) {
          fs.rmSync(pkgDir, { recursive: true, force: true });
        }
        removePackageVersionFromStore(
          selectedPackage as string,
          selectedVersion as string,
        );
        note(`Deleted ${selectedPackage}@${selectedVersion}`);
      }
    } else {
      const vData = pkgData.versions[selectedVersion as string];
      note(
        `Published: ${vData.publishedAt}\nInstallations: ${vData.installations}`,
        'Version Info',
      );
    }
  } else {
    const sure = await confirm({
      message: 'Are you sure? This deletes ALL versions.',
    });
    if (sure) {
      for (const v of versions) {
        const pkgDir = getPackageStoreDir(selectedPackage as string, v);
        if (fs.existsSync(pkgDir)) {
          fs.rmSync(pkgDir, { recursive: true, force: true });
        }
        removePackageVersionFromStore(selectedPackage as string, v);
      }
      // Also remove base dir
      const basePkgDir = getPackageStoreDir(selectedPackage as string);
      if (fs.existsSync(basePkgDir)) {
        fs.rmSync(basePkgDir, { recursive: true, force: true });
      }
      note(`Deleted ${selectedPackage}`);
    }
  }
}

export async function startInteractive() {
  console.clear();

  const welcome = figlet.textSync('DEVLINK', { font: 'Graceful' });
  console.log(pc.cyan(welcome));
  console.log(pc.dim('  by MayR Labs'));
  console.log(`${pc.dim(`  v${getVersion()}`)}\n`);

  intro(pc.bgCyan(pc.black(' Welcome to Devlink Interactive ')));

  while (true) {
    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'publish', label: '🚀 Publish', hint: 'Share local package' },
        { value: 'add', label: '➕ Add', hint: 'Import package to project' },
        {
          value: 'update',
          label: '🔄 Update',
          hint: 'Sync devlinked packages',
        },
        {
          value: 'update-all',
          label: '⚡ Update All',
          hint: 'Update all to latest',
        },
        {
          value: 'installations',
          label: '🏘️ Installations',
          hint: 'Manage devlinked projects',
        },
        { value: 'retreat', label: '🏃 Retreat', hint: 'Temporarily remove' },
        { value: 'restore', label: '⏪ Restore', hint: 'Restore retreated' },
        { value: 'remove', label: '🗑️ Remove', hint: 'Uninstall package' },
        { value: 'store', label: '📦 Store', hint: 'Browse local repository' },
        { value: 'exit', label: '🚪 Exit' },
      ],
    });

    if (isCancel(action) || action === 'exit') {
      outro(pc.cyan('Happy coding!'));
      process.exit(0);
    }

    try {
      switch (action) {
        case 'publish':
          await handlePublish();
          break;
        case 'add':
          await handleAdd();
          break;
        case 'update':
          await handleUpdate();
          break;
        case 'update-all':
          await handleUpdateAll();
          break;
        case 'installations':
          await handleInstallations();
          break;
        case 'store':
          await handleStore();
          break;
        case 'retreat':
          await handleRetreat();
          break;
        case 'restore':
          await handleRestore();
          break;
        case 'remove':
          await handleRemove();
          break;
      }
    } catch (e: any) {
      note(pc.red(e.message || 'An error occurred'), 'Error');
    }

    const backToMenu = await confirm({
      message: 'Back to main menu?',
      initialValue: true,
    });
    if (!backToMenu || isCancel(backToMenu)) {
      outro(pc.cyan('Happy coding!'));
      process.exit(0);
    }
  }
}
