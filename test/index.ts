import { deepEqual, doesNotThrow, ok, strictEqual, throws } from 'node:assert';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPackages,
  devlinkGlobal,
  publishPackage,
  readPackageManifest,
  removePackages,
  updatePackages,
} from '../src/index.js';

import { readInstallationsFile } from '../src/installations.js';

import { type LockFileConfigV1, readLockfile } from '../src/lockfile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const values = {
  depPackage: 'dep-package',
  depPackageVersion: '1.0.0',

  depPackage2: 'dep-package2',
  depPackage2Version: '1.0.0',
  storeDir: 'devlink-store',
  project: 'project',

  wksDepPkg: 'ws-package',
  wksResolvedVersion: '1.1.1',

  wksDepQualified: 'ws-package-qualified',
  wksPkgQualifiedVersion: '^1.0.0',

  wksDepMinorAlias: 'ws-package-minor-alias',
  wksMinorAliasVersion: '^1.0.1',

  wksDepPatchAlias: 'ws-package-patch-alias',
  wksPatchAliasVersion: '~1.2.3',

  wksUnresolvedPackage: 'ws-package-unresolvable',
  wksUnresolvedMinorAlias: 'ws-package-unresolvable-minor-alias',
  wksUnresolvedPatchAlias: 'ws-package-unresolvable-patch-alias',
};

const fixtureDir = join(__dirname, 'fixture');
const tmpDir = join(__dirname, 'tmp');

const shortSignatureLength = 8;

const storeMainDr = join(tmpDir, values.storeDir);
devlinkGlobal.devlinkStoreMainDir = storeMainDr;

const depPackageDir = join(tmpDir, values.depPackage);
const depPackage2Dir = join(tmpDir, values.depPackage2);
const projectDir = join(tmpDir, values.project);

let publishedPackagePath = join(
  storeMainDr,
  'packages',
  values.depPackage,
  values.depPackageVersion,
);

let publishedPackage2Path = join(
  storeMainDr,
  'packages',
  values.depPackage2,
  values.depPackage2Version,
);

const checkExists = (path: string) =>
  doesNotThrow(() => fs.accessSync(path), `${path} does not exist`);

const checkNotExists = (path: string) =>
  throws(() => fs.accessSync(path), `${path} exists`);

const extractSignature = (lockfile: LockFileConfigV1, packageName: string) => {
  const packageEntry = lockfile.packages[packageName];
  if (packageEntry === undefined) {
    throw new Error(
      `expected package ${packageName} in lockfile.packages ${JSON.stringify(
        lockfile,
        undefined,
        2,
      )}`,
    );
  }

  const signature = packageEntry.signature;
  if (signature === undefined) {
    throw new Error(
      `expected signature property in lockfile.packages.${packageName} ${JSON.stringify(
        lockfile,
        undefined,
        2,
      )}`,
    );
  }

  return signature;
};

describe('Devlink package manager', function () {
  this.timeout(60000);
  before(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.cpSync(fixtureDir, tmpDir, { recursive: true });
  });
  describe('Package publish', function () {
    this.timeout(5000);
    before(async () => {
      console.time('Package publish');
      const finalVersion = (await publishPackage({
        workingDir: depPackageDir,
        signature: true,
        workspaceResolve: true,
      })) as string;
      console.timeEnd('Package publish');
      publishedPackagePath = join(
        storeMainDr,
        'packages',
        values.depPackage,
        finalVersion,
      );
    });

    it('publishes package to store', () => {
      checkExists(publishedPackagePath);
    });

    it('copies package.json npm includes', () => {
      checkExists(join(publishedPackagePath, 'package.json'));
    });

    it('ignores standard non-code', () => {
      checkNotExists(join(publishedPackagePath, 'extra-file.txt'));
    });

    it('ignores .gitignore', () => {
      checkNotExists(join(publishedPackagePath, '.gitignore'));
    });

    it('handles "files:" manifest entry correctly', () => {
      checkExists(join(publishedPackagePath, '.mayrlabs/devlink/devlink.txt'));
      checkExists(join(publishedPackagePath, '.dot/dot.txt'));
      checkExists(join(publishedPackagePath, 'src'));
      checkExists(join(publishedPackagePath, 'dist/file.txt'));
      checkExists(join(publishedPackagePath, 'root-file.txt'));
      checkExists(join(publishedPackagePath, 'folder/file.txt'));
      checkNotExists(join(publishedPackagePath, 'folder/file2.txt'));
      checkExists(join(publishedPackagePath, 'folder2/nested/file.txt'));
      checkNotExists(join(publishedPackagePath, 'folder2/file.txt'));
      checkNotExists(join(publishedPackagePath, 'folder2/nested/file2.txt'));
      checkNotExists(join(publishedPackagePath, 'test'));
    });

    it('does not respect .npmignore, if package.json "files" present', () => {
      checkExists(join(publishedPackagePath, 'src', 'file-npm-ignored.txt'));
    });

    it('it creates signature file', () => {
      const sigFileName = join(publishedPackagePath, 'devlink.sig');
      checkExists(sigFileName);
      ok(fs.statSync(sigFileName).size === 32, 'signature file size');
    });

    it('Adds signature to package.json version', () => {
      const pkg = readPackageManifest(publishedPackagePath)!;
      const versionLength =
        values.depPackageVersion.length + shortSignatureLength + 1;
      ok(pkg.version.length === versionLength);
    });

    it('does not respect .gitignore, if .npmignore presents', () => {});

    describe('signature consistency', () => {
      let expectedSignature: string;
      before(() => {
        expectedSignature = fs
          .readFileSync(join(publishedPackagePath, 'devlink.sig'))
          .toString();
      });

      beforeEach(() => {
        return publishPackage({
          workingDir: depPackageDir,
          signature: true,
          workspaceResolve: true,
        });
      });

      for (let tries = 1; tries <= 5; tries++) {
        it(`should have a consistent signature after every publish (attempt ${tries})`, () => {
          const sigFileName = join(publishedPackagePath, 'devlink.sig');
          const signature = fs.readFileSync(sigFileName).toString();

          deepEqual(signature, expectedSignature);
        });
      }
    });

    it('resolves "workspace:*" for dependencies', () => {
      const pkg = readPackageManifest(publishedPackagePath);
      ok(pkg?.dependencies);

      const publishedVersion = pkg?.dependencies?.[values.wksDepPkg];

      strictEqual(publishedVersion, values.wksResolvedVersion);
    });

    it('resolves "workspace:^" for dependencies', () => {
      const pkg = readPackageManifest(publishedPackagePath);
      ok(pkg?.dependencies);

      const publishedVersion = pkg?.dependencies?.[values.wksDepMinorAlias];

      strictEqual(publishedVersion, values.wksMinorAliasVersion);
    });

    it('resolves "workspace:~" for dependencies', () => {
      const pkg = readPackageManifest(publishedPackagePath);
      ok(pkg?.dependencies);

      const publishedVersion = pkg?.dependencies?.[values.wksDepPatchAlias];

      strictEqual(publishedVersion, values.wksPatchAliasVersion);
    });

    it('substitutes workspace version aliases ("*", "^", "~") with "*" if unresolvable', () => {
      const pkg = readPackageManifest(publishedPackagePath);
      ok(pkg);
      ok(pkg?.dependencies);

      const publishedVersion = pkg?.dependencies?.[values.wksUnresolvedPackage];
      strictEqual(publishedVersion, '*');

      const publishedMinorAliasVersion =
        pkg?.dependencies?.[values.wksUnresolvedMinorAlias];
      strictEqual(publishedMinorAliasVersion, '*');

      const publishedPatchAliasVersion =
        pkg?.dependencies?.[values.wksUnresolvedPatchAlias];
      strictEqual(publishedPatchAliasVersion, '*');
    });

    it('extracts version of workspace dependencies if specified', () => {
      const pkg = readPackageManifest(publishedPackagePath);
      ok(pkg);
      ok(pkg?.dependencies);

      const publishedVersion = pkg?.dependencies?.[values.wksDepQualified];
      strictEqual(publishedVersion, values.wksPkgQualifiedVersion);
    });
  });

  describe('Package 2 (without `files` in manifest) publish', () => {
    const originalFilePath = join(depPackage2Dir, 'file.txt');
    before(async () => {
      console.time('Package2 publish');
      const finalVersion = (await publishPackage({
        workingDir: depPackage2Dir,
      })) as string;
      console.timeEnd('Package2 publish');
      publishedPackage2Path = join(
        storeMainDr,
        'packages',
        values.depPackage2,
        finalVersion,
      );
    });

    it('publishes package to store', () => {
      const publishedFilePath = join(publishedPackage2Path, 'file.txt');
      checkExists(publishedFilePath);
      checkExists(join(publishedPackage2Path, 'package.json'));
    });
  });

  describe('Add package', () => {
    before(() => {
      return addPackages([values.depPackage], {
        workingDir: projectDir,
      });
    });
    it('copies package to .mayrlabs/devlink folder', () => {
      checkExists(join(projectDir, '.mayrlabs/devlink', values.depPackage));
    });
    it('copies remove package to node_modules', () => {
      checkExists(join(projectDir, 'node_modules', values.depPackage));
    });
    it('creates to devlink.lock', () => {
      checkExists(join(projectDir, 'devlink.lock'));
    });
    it('places devlink.lock correct info about file', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      const signature = extractSignature(lockFile, values.depPackage);
      deepEqual(lockFile.packages, {
        [values.depPackage]: {
          file: true,
          replaced: '1.0.0',
          signature: signature,
          version: `${values.depPackageVersion}+${signature.substring(0, 8)}`,
        },
      });
    });
    it('updates package.json', () => {
      const pkg = readPackageManifest(projectDir)!;
      deepEqual(pkg.dependencies, {
        [values.depPackage]: `file:.mayrlabs/devlink/${values.depPackage}`,
      });
    });
    it('create and updates installations file', () => {
      const installations = readInstallationsFile();
      deepEqual(installations, {
        [values.depPackage]: [projectDir],
      });
    });
    it('preserves indent after installation', () => {
      const pkg = readPackageManifest(projectDir)!;
      strictEqual(pkg.__Indent, '  ');
    });
  });

  describe('Update package', () => {
    const innerNodeModulesFile = join(
      projectDir,
      'node_modules',
      values.depPackage,
      'node_modules/file.txt',
    );
    before(() => {
      fs.mkdirSync(dirname(innerNodeModulesFile), { recursive: true });
      fs.writeFileSync(innerNodeModulesFile, 'test');
      return updatePackages([values.depPackage], {
        workingDir: projectDir,
      });
    });

    it('does not change devlink.lock', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      console.log('lockFile', lockFile);
      const signature = extractSignature(lockFile, values.depPackage);
      deepEqual(lockFile.packages, {
        [values.depPackage]: {
          file: true,
          replaced: '1.0.0',
          signature: signature,
          version: `${values.depPackageVersion}+${signature.substring(0, 8)}`,
        },
      });
    });
    it('does not remove inner node_modules', () => {
      checkExists(innerNodeModulesFile);
    });
  });

  describe('Remove not existing package', () => {
    before(() => {
      return removePackages(['xxxx'], {
        workingDir: projectDir,
      });
    });
    it('does not updates devlink.lock', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      const signature = extractSignature(lockFile, values.depPackage);
      deepEqual(lockFile.packages, {
        [values.depPackage]: {
          file: true,
          replaced: '1.0.0',
          signature: signature,
          version: `${values.depPackageVersion}+${signature.substring(0, 8)}`,
        },
      });
    });
  });

  describe('Retreat package', () => {
    before(() => {
      return removePackages([values.depPackage], {
        workingDir: projectDir,
        retreat: true,
      });
    });

    it('does not updates devlink.lock', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      const signature = extractSignature(lockFile, values.depPackage);
      deepEqual(lockFile.packages, {
        [values.depPackage]: {
          file: true,
          replaced: '1.0.0',
          signature: signature,
          version: `${values.depPackageVersion}+${signature.substring(0, 8)}`,
        },
      });
    });

    it('updates package.json', () => {
      const pkg = readPackageManifest(projectDir)!;
      deepEqual(pkg.dependencies, {
        [values.depPackage]: values.depPackageVersion,
      });
    });

    it('does not update installations file', () => {
      const installtions = readInstallationsFile();
      deepEqual(installtions, {
        [values.depPackage]: [projectDir],
      });
    });

    it('should not remove package from .mayrlabs/devlink', () => {
      checkExists(join(projectDir, '.mayrlabs/devlink', values.depPackage));
    });

    it('should remove package from node_modules', () => {
      checkNotExists(join(projectDir, 'node_modules', values.depPackage));
    });
  });

  describe('Update (restore after retreat) package', () => {
    before(() => {
      return updatePackages([values.depPackage], {
        workingDir: projectDir,
      });
    });

    it('updates package.json', () => {
      const pkg = readPackageManifest(projectDir)!;
      deepEqual(pkg.dependencies, {
        [values.depPackage]: `file:.mayrlabs/devlink/${values.depPackage}`,
      });
    });
  });

  describe('Remove package', () => {
    before(() => {
      return removePackages([values.depPackage], {
        workingDir: projectDir,
      });
    });

    it('updates devlink.lock', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      deepEqual(lockFile.packages, {});
    });

    it('updates package.json', () => {
      const pkg = readPackageManifest(projectDir)!;
      deepEqual(pkg.dependencies, {
        [values.depPackage]: values.depPackageVersion,
      });
    });

    it('updates installations file', () => {
      const installtions = readInstallationsFile();
      deepEqual(installtions, {});
    });
    it('should remove package from .mayrlabs/devlink', () => {
      checkNotExists(join(projectDir, '.mayrlabs/devlink', values.depPackage));
    });

    it('should remove package from node_modules', () => {
      checkNotExists(join(projectDir, 'node_modules', values.depPackage));
    });
  });

  describe('Add package (--link)', () => {
    before(() => {
      return addPackages([values.depPackage], {
        workingDir: projectDir,
        linkDep: true,
      });
    });
    it('copies package to .mayrlabs/devlink folder', () => {
      checkExists(join(projectDir, '.mayrlabs/devlink', values.depPackage));
    });
    it('copies remove package to node_modules', () => {
      checkExists(join(projectDir, 'node_modules', values.depPackage));
    });
    it('creates to devlink.lock', () => {
      checkExists(join(projectDir, 'devlink.lock'));
    });
    it('places devlink.lock correct info about file', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      const signature = extractSignature(lockFile, values.depPackage);
      deepEqual(lockFile.packages, {
        [values.depPackage]: {
          link: true,
          replaced: '1.0.0',
          signature: signature,
          version: `${values.depPackageVersion}+${signature.substring(0, 8)}`,
        },
      });
    });
    it('updates package.json', () => {
      const pkg = readPackageManifest(projectDir)!;
      deepEqual(pkg.dependencies, {
        [values.depPackage]: `link:.mayrlabs/devlink/${values.depPackage}`,
      });
    });
    it('create and updates installations file', () => {
      const installtions = readInstallationsFile();
      deepEqual(installtions, {
        [values.depPackage]: [projectDir],
      });
    });
  });

  describe('Updated linked (--link) package', () => {
    before(() => {
      return updatePackages([values.depPackage], {
        workingDir: projectDir,
      });
    });
    it('places devlink.lock correct info about file', () => {
      const lockFile = readLockfile({ workingDir: projectDir });
      const signature = extractSignature(lockFile, values.depPackage);
      deepEqual(lockFile.packages, {
        [values.depPackage]: {
          link: true,
          replaced: '1.0.0',
          signature: signature,
          version: `${values.depPackageVersion}+${signature.substring(0, 8)}`,
        },
      });
    });
    it('updates package.json', () => {
      const pkg = readPackageManifest(projectDir)!;
      deepEqual(pkg.dependencies, {
        [values.depPackage]: `link:.mayrlabs/devlink/${values.depPackage}`,
      });
    });
    it('create and updates installations file', () => {
      const installtions = readInstallationsFile();
      deepEqual(installtions, {
        [values.depPackage]: [projectDir],
      });
    });
  });
});
