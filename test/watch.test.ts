import { ok } from 'node:assert';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devlinkGlobal } from '../src/index.js';
import { publishPackageWatch } from '../src/publish.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, 'tmp-watch');

describe('Watch Mode', function () {
  this.timeout(20000);

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    // Minimal package.json
    fs.writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'watch-pkg', version: '1.0.0' }),
    );
    // Dummy index.js
    fs.writeFileSync(join(tmpDir, 'index.js'), 'console.log("hello")');

    // Set store in a separate tmp location outside of the watched tmpDir
    const storeDir = join(__dirname, 'tmp-watch-store');
    fs.rmSync(storeDir, { recursive: true, force: true });
    fs.mkdirSync(storeDir, { recursive: true });
    devlinkGlobal.devlinkStoreMainDir = storeDir;
  });

  it('should trigger a republish when a file changes', async () => {
    const watcher = await publishPackageWatch({
      workingDir: tmpDir,
      push: false,
      changed: false, // Ensure it always publishes for testing
    });

    try {
      // Change file
      fs.writeFileSync(join(tmpDir, 'index.js'), 'console.log("changed")');

      // Wait a bit for the watcher to trigger and publish to finish
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const storePackagesDir = join(
        devlinkGlobal.devlinkStoreMainDir as string,
        'packages',
        'watch-pkg',
      );
      ok(fs.existsSync(storePackagesDir), 'Store directory should exist');
      const versions = fs.readdirSync(storePackagesDir);
      ok(versions.length >= 1, 'Should have at least one version published');
    } finally {
      await watcher.close();
    }
  });

  it('should debounce multiple rapid changes', async () => {
    // Note: We are testing that it doesn't crash or trigger dozens of times.
    const watcher = await publishPackageWatch({
      workingDir: tmpDir,
      push: false,
      changed: false,
      signature: true, // Use signatures so we get different version folders
    });

    try {
      // Wait for initial publish
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const storePackagesDir = join(
        devlinkGlobal.devlinkStoreMainDir as string,
        'packages',
        'watch-pkg',
      );

      // Rapid changes
      for (let i = 0; i < 3; i++) {
        fs.writeFileSync(
          join(tmpDir, 'index.js'),
          `console.log("change ${i}")`,
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Wait for debounce and publish
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const versionsBefore = fs.readdirSync(storePackagesDir);

      // Trigger one more change
      fs.writeFileSync(join(tmpDir, 'index.js'), 'console.log("final")');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const versionsAfter = fs.readdirSync(storePackagesDir);
      ok(
        versionsAfter.length > versionsBefore.length,
        `Expected more versions. Before: ${versionsBefore.length}, After: ${versionsAfter.length}`,
      );
    } finally {
      await watcher.close();
    }
  });

  it('should ignore changes in ignored directories like dist/', async () => {
    const watcher = await publishPackageWatch({
      workingDir: tmpDir,
      push: false,
      changed: false,
      signature: true,
    });

    try {
      const distDir = join(tmpDir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });

      const storePackagesDir = join(
        devlinkGlobal.devlinkStoreMainDir as string,
        'packages',
        'watch-pkg',
      );
      // Wait for initial publish to finish
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const versionsBefore = fs.readdirSync(storePackagesDir).length;

      // Create file in dist/
      fs.writeFileSync(join(distDir, 'bundle.js'), 'console.log("built")');

      // Wait to ensure NO republish happens
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const versionsAfter = fs.readdirSync(storePackagesDir).length;
      ok(
        versionsAfter === versionsBefore,
        `Should NOT have published a new version for changes in dist/. Before: ${versionsBefore}, After: ${versionsAfter}`,
      );
    } finally {
      await watcher.close();
    }
  });
});
