#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { checkManifest } from './check.js';
import { disabledConsoleOutput, makeConsoleColored } from './console.js';
import {
  addPackages,
  devlinkGlobal,
  getStoreMainDir,
  publishPackage,
  removePackages,
  updatePackages,
  values,
} from './index.js';
import { cleanInstallations, showInstallations } from './installations.js';
import type { PublishPackageOptions } from './publish.js';
import { readRcConfig } from './rc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const updateFlags = ['update', 'upgrade', 'up'];

const publishFlags = [
  'scripts',
  'sig',
  'dev-mod',
  'changed',
  'files',
  ...updateFlags,
];

const cliCommand = values.myNameIs;

const getVersionMessage = () => {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
};

makeConsoleColored();

const rcArgs = readRcConfig();

if (process.argv.includes('--quiet') || rcArgs.quiet) disabledConsoleOutput();

const getPublishOptions = (
  argv: any,
  override: Partial<PublishPackageOptions> = {},
): PublishPackageOptions => {
  const folder = argv._[1];

  return {
    workingDir: join(process.cwd(), folder || ''),
    push: argv.push,
    replace: argv.replace,
    signature: argv.sig,
    changed: argv.changed,
    content: argv.content,
    private: argv.private,
    scripts: argv.scripts,
    update: argv.update || argv.upgrade,
    workspaceResolve: argv.workspaceResolve,
    devMod: argv.devMod,
    ...override,
  };
};

/* tslint:disable-next-line */
yargs(process.argv.slice(2))
  .usage(`${cliCommand} [command] [options] [package1 [package2...]]`)
  .coerce('store-folder', (folder: string) => {
    if (!devlinkGlobal.devlinkStoreMainDir) {
      devlinkGlobal.devlinkStoreMainDir = resolve(folder);

      console.log(
        'Package store folder used:',
        devlinkGlobal.devlinkStoreMainDir,
      );
    }
  })
  .command({
    command: '*',
    builder: (y) => y.boolean(['version']),
    handler: (argv) => {
      let msg = 'Use `devlink help` to see available commands.';

      if (argv._[0]) msg = `Unknown command \`${argv._[0]}\`. ${msg}`;
      else if (argv.version) msg = getVersionMessage();

      console.log(msg);
    },
  })
  .command({
    command: 'publish',
    describe: 'Publish package in devlink local repo',
    builder: (y) => {
      return y
        .default('sig', false)
        .default('scripts', true)
        .default('dev-mod', true)
        .default('workspace-resolve', true)
        .default(rcArgs as any)
        .alias('script', 'scripts')
        .boolean(['push'].concat(publishFlags));
    },
    handler: (argv) => {
      publishPackage(getPublishOptions(argv));
    },
  })
  .command({
    command: 'push',
    describe:
      'Publish package in devlink local repo and push to all installations',
    builder: (y) => {
      return y
        .default('sig', false)
        .default('scripts', false)
        .default('dev-mod', true)
        .default('workspace-resolve', true)
        .default(rcArgs as any)
        .alias('script', 'scripts')
        .boolean(['safe'].concat(publishFlags))
        .option('replace', { describe: 'Force package content replacement' });
    },
    handler: (argv) => {
      publishPackage(getPublishOptions(argv, { push: true }));
    },
  })
  .command({
    command: 'installations',
    describe: 'Work with installations file: show/clean',
    builder: (y) => y.boolean(['dry']),
    handler: async (argv) => {
      const action = argv._[1];
      const packages = argv._.slice(2) as string[];
      switch (action) {
        case 'show':
          showInstallations({ packages });
          break;

        case 'clean':
          await cleanInstallations({ packages, dry: !!argv.dry });
          break;

        default:
          console.info('Need installation action: show | clean');
      }
    },
  })
  .command({
    command: 'add',
    describe: 'Add package from devlink repo to the project',
    builder: (y) => {
      return y
        .boolean(['file', 'dev', 'link', ...updateFlags])
        .alias('D', 'dev')
        .boolean('workspace')
        .alias('save-dev', 'dev')
        .alias('workspace', 'W')
        .default(rcArgs as any)
        .help(true);
    },
    handler: (argv) => {
      addPackages(argv._.slice(1) as string[], {
        dev: !!argv.dev,
        linkDep: !!argv.link,
        restore: !!argv.restore,
        pure: !!argv.pure,
        workspace: !!argv.workspace,
        update: !!(argv.update || argv.upgrade),
        workingDir: process.cwd(),
      });
    },
  })
  .command({
    command: 'link',
    describe: 'Link package from devlink repo to the project',
    builder: (y) => y.default(rcArgs as any).help(true),
    handler: (argv) => {
      addPackages(argv._.slice(1) as string[], {
        link: true,
        pure: !!argv.pure,
        workingDir: process.cwd(),
      });
    },
  })
  .command({
    command: 'update',
    describe: 'Update packages from devlink repo',
    builder: (y) => {
      return y
        .boolean([...updateFlags])
        .default(rcArgs as any)
        .help(true);
    },
    handler: (argv) => {
      updatePackages(argv._.slice(1) as string[], {
        update: !!(argv.update || argv.upgrade),
        restore: !!argv.restore,
        workingDir: process.cwd(),
      });
    },
  })
  .command({
    command: 'restore',
    describe: 'Restore retreated packages',
    builder: (y) => {
      return y
        .boolean([...updateFlags])
        .default(rcArgs as any)
        .help(true);
    },
    handler: (argv) => {
      updatePackages(argv._.slice(1) as string[], {
        update: !!(argv.update || argv.upgrade),
        restore: true,
        workingDir: process.cwd(),
      });
    },
  })
  .command({
    command: 'remove',
    describe: 'Remove packages from the project',
    builder: (y) => {
      return y
        .boolean(['retreat', 'all'])
        .default(rcArgs as any)
        .help(true);
    },
    handler: (argv) => {
      removePackages(argv._.slice(1) as string[], {
        retreat: !!argv.retreat,
        workingDir: process.cwd(),
        all: !!argv.all,
      });
    },
  })
  .command({
    command: 'retreat',
    describe:
      'Remove packages from project, but leave in lock file (to be restored later)',
    builder: (y) => y.boolean(['all']).help(true),
    handler: (argv) => {
      removePackages(argv._.slice(1) as string[], {
        all: !!argv.all,
        retreat: true,
        workingDir: process.cwd(),
      });
    },
  })
  .command({
    command: 'check',
    describe: 'Check package.json for devlink packages',
    builder: (y) => {
      return y.boolean(['commit']).usage('check usage here').help(true);
    },
    handler: (argv) => {
      const gitParams = process.env.GIT_PARAMS;
      if (argv.commit) console.log('gitParams', gitParams);

      checkManifest({
        commit: !!argv.commit,
        all: !!argv.all,
        workingDir: process.cwd(),
      });
    },
  })
  .command({
    command: 'dir',
    describe: 'Show devlink system directory',
    handler: () => {
      console.log(getStoreMainDir());
    },
  })
  .help('help')
  .parse();
