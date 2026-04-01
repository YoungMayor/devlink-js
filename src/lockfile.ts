import * as fs from 'node:fs';
import { join } from 'node:path';

import { values } from './index.js';

export type LockFileConfigV0 = {
  [packageName: string]: {
    version?: string;
    file?: boolean;
  };
};

export type LockFilePackageEntry = {
  version?: string;
  file?: boolean;
  link?: boolean;
  replaced?: string;
  signature?: string;
  pure?: boolean;
  workspace?: boolean;
};

export type LockFileConfigV1 = {
  version: 'v1';
  packages: {
    [packageName: string]: LockFilePackageEntry;
  };
};
type LockFileVersions = 'v1' | 'v0';

type LockFileConfig = LockFileConfigV1;

const determineLockFileVersion = (lockfile: {
  version?: string;
  packages?: any;
}) => {
  if (lockfile.version === 'v1' && lockfile.packages) return 'v1';

  return 'v0';
};

type ConfigTransformers = {
  [key in LockFileVersions]: (lockfile: any) => LockFileConfig;
};

const configTransformers: ConfigTransformers = {
  v0: (lockFile: LockFileConfigV0) => ({ version: 'v1', packages: lockFile }),

  v1: (lockFile: LockFileConfigV1) => lockFile,
};

const getLockFileCurrentConfig = (lockFileConfig: unknown) => {
  const version = determineLockFileVersion(
    lockFileConfig as { version?: string },
  );

  return configTransformers[version](lockFileConfig);
};

export const removeLockfile = (options: { workingDir: string }) => {
  const lockfilePath = join(options.workingDir, values.lockfileName);
  if (fs.existsSync(lockfilePath)) {
    fs.rmSync(lockfilePath, { recursive: true, force: true });
  }
};

export const readLockfile = (options: { workingDir: string }) => {
  const lockfilePath = join(options.workingDir, values.lockfileName);
  let lockfile: LockFileConfig = { version: 'v1', packages: {} };
  try {
    lockfile = getLockFileCurrentConfig(
      JSON.parse(fs.readFileSync(lockfilePath, 'utf-8')),
    );
  } catch (e) {
    return lockfile;
  }
  return lockfile as LockFileConfig;
};

export const writeLockfile = (
  lockfile: LockFileConfig,
  options: { workingDir: string },
) => {
  const lockfilePath = join(options.workingDir, values.lockfileName);
  const data = JSON.stringify(lockfile, null, 2);

  fs.writeFileSync(lockfilePath, data);
};

export const addPackageToLockfile = (
  packages: ({ name: string } & LockFilePackageEntry)[],
  options: { workingDir: string },
) => {
  const lockfile = readLockfile(options);
  for (const pkgInfo of packages) {
    const { name, version, file, link, replaced, signature, pure, workspace } =
      pkgInfo;

    const old = lockfile.packages[name] || {};

    lockfile.packages[name] = {};

    if (version) lockfile.packages[name].version = version;

    if (signature) lockfile.packages[name].signature = signature;

    if (file) lockfile.packages[name].file = true;

    if (link) lockfile.packages[name].link = true;

    if (pure) lockfile.packages[name].pure = true;

    if (workspace) lockfile.packages[name].workspace = true;

    if (replaced || old.replaced)
      lockfile.packages[name].replaced = replaced || old.replaced;
  }
  writeLockfile(lockfile, options);
};
