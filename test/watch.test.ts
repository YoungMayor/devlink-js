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

    // Set store in a separate tmp location
    const storeDir = join(tmpDir, 'store');
    fs.mkdirSync(storeDir, { recursive: true });
    devlinkGlobal.devlinkStoreMainDir = storeDir;
  });

  it('should trigger a republish when a file changes', async () => {
    const watcher = await publishPackageWatch({
      workingDir: tmpDir,
      push: false,
    });

    try {
      // Change file
      fs.writeFileSync(join(tmpDir, 'index.js'), 'console.log("changed")');

      // Wait a bit for the watcher to trigger and publish to finish
      // We can't easily wait for the internal `runPublish` to finish without more hooks,
      // but we can check the store after some time.
      await new Promise((resolve) => setTimeout(resolve, 2000));

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
});
