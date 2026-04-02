#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { checkManifest } from './check.js';
import { disabledConsoleOutput, makeConsoleColored } from './console.js';
import { gitIgnore, gitShow } from './git.js';
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
import { startInteractive } from './interactive.js';
import { publishPackageWatch } from './publish.js';
import type { PublishPackageOptions } from './publish.js';
import { readRcConfig } from './rc.js';
import { findBestMatch } from './suggest.js';
import { updateAllPackages } from './update.js';

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

const commands = [
  'publish',
  'add',
  'installations',
  'update',
  'update-all',
  'restore',
  'remove',
  'retreat',
  'check',
  'store',
  'git',
  'dir',
  'help',
];

if (process.argv.length <= 2) {
  await startInteractive();
} else {
  /* tslint:disable-next-line */
  const argv = await yargs(process.argv.slice(2))
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
          .boolean(['push', 'watch'].concat(publishFlags));
      },
      handler: async (argv) => {
        const options = getPublishOptions(argv);
        if (argv.watch) {
          await publishPackageWatch(options);
        } else {
          await publishPackage(options);
        }
      },
    })
    .command({
      command: 'publish:watch',
      describe: 'Publish package in watch mode',
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
      handler: async (argv) => {
        await publishPackageWatch(getPublishOptions(argv));
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
      handler: async (argv) => {
        await addPackages(argv._.slice(1) as string[], {
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
      command: 'update',
      describe: 'Update packages from devlink repo',
      builder: (y) => {
        return y
          .boolean([...updateFlags])
          .default(rcArgs as any)
          .help(true);
      },
      handler: async (argv) => {
        await updatePackages(argv._.slice(1) as string[], {
          update: !!(argv.update || argv.upgrade),
          restore: !!argv.restore,
          workingDir: process.cwd(),
        });
      },
    })
    .command({
      command: 'update-all',
      describe: 'Update all devlinked packages to latest version',
      handler: async () => {
        await updateAllPackages(process.cwd());
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
      handler: async (argv) => {
        await updatePackages(argv._.slice(1) as string[], {
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
      handler: async (argv) => {
        await removePackages(argv._.slice(1) as string[], {
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
      handler: async (argv) => {
        await removePackages(argv._.slice(1) as string[], {
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
      handler: async (argv) => {
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
      command: 'git',
      describe: 'Manage .gitignore for devlink files',
      handler: async (argv) => {
        const action = argv._[1];
        if (action === 'ignore') {
          gitIgnore(process.cwd());
        } else if (action === 'show') {
          gitShow(process.cwd());
        } else {
          console.info('Need git action: ignore | show');
        }
      },
    })
    .command({
      command: 'store',
      describe: 'Manage devlink store (runs interactive store manager)',
      handler: async () => {
        // We can just launch interactive mode or a specific part of it
        // For now, let's just launch interactive mode as it has a store section
        await startInteractive();
      },
    })
    .command({
      command: 'dir',
      describe: 'Show devlink system directory',
      handler: () => {
        console.log(getStoreMainDir());
      },
    })
    .command({
      command: '*',
      builder: (y) => y.boolean(['version']),
      handler: (argv) => {
        const inputCommand = argv._[0] as string;
        if (!inputCommand) {
          if (argv.version) {
            console.log(getVersionMessage());
          } else {
            console.log('Use `devlink --help` to see available commands.');
          }
          return;
        }

        const matches = findBestMatch(inputCommand, commands);
        let msg = `Unknown command \`${inputCommand}\`.`;
        if (matches.bestMatch.rating > 0.4) {
          msg += ` Did you mean \`${matches.bestMatch.target}\`?`;
        }
        msg += ' Use `devlink --help` to see available commands.';
        console.log(msg);
      },
    })
    .help('help')
    .parse();
}
