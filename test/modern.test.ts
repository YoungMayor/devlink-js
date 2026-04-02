import { deepEqual, equal, ok } from 'node:assert';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitIgnore, gitShow } from '../src/git.js';
import { devlinkGlobal } from '../src/index.js';
import {
  decrementInstallation,
  incrementInstallation,
  readStore,
  removePackageVersionFromStore,
  updatePackageInStore,
} from '../src/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, 'tmp-modern');

describe('Modern Features', function () {
  this.timeout(10000);

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    devlinkGlobal.devlinkStoreMainDir = tmpDir;
  });

  describe('Store Management', () => {
    it('should initialize an empty store', () => {
      const store = readStore();
      deepEqual(store.packages, {});
    });

    it('should increment installations', () => {
      updatePackageInStore('test-pkg', '1.0.0');
      incrementInstallation('test-pkg', '1.0.0');
      const store = readStore();
      ok(store.packages['test-pkg']);
      equal(store.packages['test-pkg'].versions['1.0.0'].installations, 1);
    });

    it('should decrement installations', () => {
      updatePackageInStore('test-pkg', '1.0.0');
      incrementInstallation('test-pkg', '1.0.0');
      decrementInstallation('test-pkg', '1.0.0');
      const store = readStore();
      equal(store.packages['test-pkg'].versions['1.0.0'].installations, 0);
    });

    it('should remove package version', () => {
      updatePackageInStore('test-pkg', '1.0.0');
      removePackageVersionFromStore('test-pkg', '1.0.0');
      const store = readStore();
      equal(store.packages['test-pkg'], undefined);
    });
  });

  describe('Git Integration', () => {
    const gitIgnorePath = join(tmpDir, '.gitignore');

    beforeEach(() => {
      fs.writeFileSync(gitIgnorePath, 'node_modules\n');
    });

    it('should add devlink entries to .gitignore', () => {
      gitIgnore(tmpDir);
      const content = fs.readFileSync(gitIgnorePath, 'utf-8');
      ok(content.includes('.mayrlabs/devlink/'));
      ok(content.includes('devlink.lock'));
    });

    it('should remove devlink entries from .gitignore', () => {
      gitIgnore(tmpDir);
      gitShow(tmpDir);
      const content = fs.readFileSync(gitIgnorePath, 'utf-8');
      ok(!content.includes('.mayrlabs/devlink/'));
      ok(!content.includes('devlink.lock'));
    });
  });
});
