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
  publishPackage,
  readPackageManifest,
  removePackages,
  updatePackages,
} from './index.js';
import { cleanInstallations, showInstallations } from './installations.js';
import { publishPackageWatch } from './publish.js';
import { readStore, removePackageVersionFromStore } from './store.js';

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

async function handlePublish() {
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
    initialValue: false,
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

async function handleAdd() {
  const store = readStore();
  const packageNames = Object.keys(store.packages);

  if (packageNames.length === 0) {
    note(pc.yellow('Store is empty. Publish some packages first!'), 'Info');
    return;
  }

  const selectedPackage = await select({
    message: 'Select a package to add:',
    options: packageNames.map((name) => ({ value: name, label: name })),
  });

  if (isCancel(selectedPackage)) return;

  const pkgData = store.packages[selectedPackage as string];
  const versions = Object.keys(pkgData.versions).sort((a, b) => {
    const timeA = new Date(pkgData.versions[a].publishedAt).getTime();
    const timeB = new Date(pkgData.versions[b].publishedAt).getTime();
    return timeB - timeA;
  });

  const selectedVersion = await select({
    message: `Select version for ${pc.cyan(selectedPackage as string)}:`,
    options: versions.map((v) => ({ value: v, label: v })),
  });

  if (isCancel(selectedVersion)) return;

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

  s.stop(`${pc.green(selectedPackage as string)} added successfully!`);
}

async function handleInstallations() {
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
    // For clean, we could prompt for specific packages, but let's keep it simple for now or implement multi-select
    const dryRun = await confirm({
      message: 'Dry run?',
      initialValue: true,
    });
    if (isCancel(dryRun)) return;

    await cleanInstallations({ packages: [], dry: dryRun });
  }
}

async function handleUpdate() {
  // Similar to add but only for packages already in the project
  // Actually, devlink update usually updates all or specific ones
  const workingDir = process.cwd();
  // We should ideally read the devlink.lock or package.json to see what's devlinked
  // For now, call the standard update which handles this
  const s = spinner();
  s.start('Updating devlinked packages...');
  await updatePackages([], { workingDir, update: true });
  s.stop('Updates completed.');
}

async function handleStore() {
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

  const welcome = figlet.textSync('DEVLINK', { font: 'Graceful' as any });
  console.log(pc.cyan(welcome));
  console.log(`${pc.dim(`v${getVersion()}`)}\n`);

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
          value: 'installations',
          label: '🏘️ Installations',
          hint: 'Manage devlinked projects',
        },
        { value: 'store', label: '📦 Store', hint: 'Browse local repository' },
        {
          value: 'remove',
          label: '🗑️ Remove',
          hint: 'Uninstall devlinked package',
        },
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
        case 'installations':
          await handleInstallations();
          break;
        case 'store':
          await handleStore();
          break;
        case 'remove': {
          const pkgs = await text({
            message: 'Enter package names to remove (space separated):',
          });
          if (!isCancel(pkgs)) {
            await removePackages((pkgs as string).split(' '), {
              workingDir: process.cwd(),
            });
          }
          break;
        }
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
