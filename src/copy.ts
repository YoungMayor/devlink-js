import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import npmPacklist from 'npm-packlist';
import { readPackageManifest, readSignatureFile } from './index.js';
import {
  type PackageManifest,
  getStorePackagesDir,
  writePackageManifest,
  writeSignatureFile,
} from './index.js';

const shortSignatureLength = 8;

export const getFileHash = (srcPath: string, relPath = '') => {
  return new Promise<string>((resolve, reject) => {
    const stream = fs.createReadStream(srcPath);
    const md5sum = crypto.createHash('md5');

    md5sum.update(relPath.replace(/\\/g, '/'));

    stream.on('data', (data: Buffer | string) => md5sum.update(data));
    stream.on('error', reject).on('close', () => {
      resolve(md5sum.digest('hex'));
    });
  });
};

const copyFile = async (srcPath: string, destPath: string, relPath = '') => {
  await fsPromises.mkdir(dirname(destPath), { recursive: true });

  await fsPromises.cp(srcPath, destPath, { recursive: true });

  return getFileHash(srcPath, relPath);
};

const mapObj = <T, R, K extends string>(
  obj: Record<K, T>,
  mapValue: (value: T, key: K) => R,
): Record<string, R> => {
  const resObj: Record<string, R> = {};

  for (const key of Object.keys(obj) as K[]) {
    const val = obj[key];

    if (val !== undefined && val !== null) resObj[key] = mapValue(val, key);
  }

  return resObj;
};

const resolveWorkspaceDepVersion = (
  version: string,
  pkgName: string,
  workingDir: string,
): string => {
  // Regular semver specification
  if (version !== '*' && version !== '^' && version !== '~') return version;

  // Resolve workspace version aliases
  const prefix = version === '^' || version === '~' ? version : '';

  try {
    const require = createRequire(join(workingDir, 'index.js'));
    const pkgPath = require.resolve(join(pkgName, 'package.json'));
    const resolved = readPackageManifest(dirname(pkgPath))?.version;

    return prefix + resolved || '*';
  } catch (e) {
    console.warn('Could not resolve workspace package location for', pkgName);
    return '*';
  }
};

const resolveWorkspaces = (
  pkg: PackageManifest,
  workingDir: string,
): PackageManifest => {
  const resolveDeps = (deps: PackageManifest['dependencies']) => {
    return deps
      ? mapObj(deps, (val, depPkgName) => {
          if (val.startsWith('workspace:')) {
            const version = val.split(':')[1];

            const resolved = resolveWorkspaceDepVersion(
              version,
              depPkgName,
              workingDir,
            );

            console.log(
              `Resolving workspace package ${depPkgName} version ==> ${resolved}`,
            );

            return resolved;
          }
          return val;
        })
      : deps;
  };

  return {
    ...pkg,
    dependencies: resolveDeps(pkg.dependencies),
    devDependencies: resolveDeps(pkg.devDependencies),
    peerDependencies: resolveDeps(pkg.peerDependencies),
  };
};

const modPackageDev = (pkg: PackageManifest) => {
  return {
    ...pkg,
    scripts: pkg.scripts
      ? {
          ...pkg.scripts,
          prepare: undefined,
          prepublish: undefined,
        }
      : undefined,
    devDependencies: undefined,
  };
};

const fixScopedRelativeName = (path: string) => path.replace(/^\.\//, '');

export const copyPackageToStore = async (options: {
  workingDir: string;
  signature?: boolean;
  changed?: boolean;
  content?: boolean;
  devMod?: boolean;
  workspaceResolve?: boolean;
}): Promise<string | false> => {
  const { workingDir, devMod = true } = options;
  const pkg = readPackageManifest(workingDir);

  if (!pkg) throw new Error('Error copying package to store.');

  const copyFromDir = options.workingDir;
  const storePackageStoreDir = join(
    getStorePackagesDir(),
    pkg.name,
    pkg.version,
  );

  const filesToCopy: string[] = await (
    await npmPacklist({ path: workingDir })
  ).map(fixScopedRelativeName);

  if (options.content) {
    console.info('Files included in published content:');
    const sortedFiles = filesToCopy.sort();

    for (const f of sortedFiles) console.log(`- ${f}`);

    console.info(`Total ${filesToCopy.length} files.`);
  }
  const copyFilesToStore = async () => {
    if (fs.existsSync(storePackageStoreDir)) {
      await fsPromises.rm(storePackageStoreDir, {
        recursive: true,
        force: true,
      });
    }

    return Promise.all(
      filesToCopy
        .sort()
        .map((relPath) =>
          copyFile(
            join(copyFromDir, relPath),
            join(storePackageStoreDir, relPath),
            relPath,
          ),
        ),
    );
  };

  const hashes = options.changed
    ? await Promise.all(
        filesToCopy
          .sort()
          .map((relPath) => getFileHash(join(copyFromDir, relPath), relPath)),
      )
    : await copyFilesToStore();

  const signature = crypto
    .createHash('md5')
    .update(hashes.join(''))
    .digest('hex');

  if (options.changed) {
    const publishedSig = readSignatureFile(storePackageStoreDir);

    if (signature === publishedSig) return false;

    await copyFilesToStore();
  }

  writeSignatureFile(storePackageStoreDir, signature);

  const versionPre = options.signature
    ? `+${signature.substring(0, shortSignatureLength)}`
    : '';

  const resolveDeps = (pkg: PackageManifest): PackageManifest =>
    options.workspaceResolve ? resolveWorkspaces(pkg, workingDir) : pkg;

  const pkgToWrite: PackageManifest = {
    ...resolveDeps(devMod ? modPackageDev(pkg) : pkg),
    devlinkSig: signature,
    version: pkg.version + versionPre,
  };

  writePackageManifest(storePackageStoreDir, pkgToWrite);

  return signature;
};
