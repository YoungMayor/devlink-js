import type { ExecSyncOptions } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as fs from 'fs-extra';

const userHome = homedir();

export const values = {
  myNameIs: 'devlink',
  ignoreFileName: '.devlinkignore',
  myNameIsCapitalized: 'Devlink',
  lockfileName: 'devlink.lock',
  devlinkPackagesFolder: '.mayrlabs/devlink',
  prescript: 'predevlink',
  postscript: 'postdevlink',
  installationsFile: 'installations.json',
};

export interface UpdatePackagesOptions {
  safe?: boolean;
  workingDir: string;
}

export { publishPackage } from './publish';
export { updatePackages } from './update';
export { checkManifest } from './check';
export { removePackages } from './remove';
export { addPackages } from './add';
export * from './pkg';
export * from './pm';

export interface DevlinkGlobal {
  devlinkStoreMainDir: string;
}
/* 
  Not using Node.Global because in this case 
  <reference types="mocha" /> is aded in built d.ts file  
*/
export const devlinkGlobal: DevlinkGlobal = global as any;

export function getStoreMainDir(): string {
  if (devlinkGlobal.devlinkStoreMainDir) {
    return devlinkGlobal.devlinkStoreMainDir;
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, values.myNameIsCapitalized);
  }
  return join(userHome, '.mayrlabs', 'devlink');
}

export function getStorePackagesDir(): string {
  return join(getStoreMainDir(), 'packages');
}

export const getPackageStoreDir = (packageName: string, version = '') =>
  join(getStorePackagesDir(), packageName, version);

export const execLoudOptions = { stdio: 'inherit' } as ExecSyncOptions;

const signatureFileName = 'devlink.sig';

export const readSignatureFile = (workingDir: string) => {
  const signatureFilePath = join(workingDir, signatureFileName);
  try {
    const fileData = fs.readFileSync(signatureFilePath, 'utf-8');
    return fileData;
  } catch (e) {
    return '';
  }
};

export const readIgnoreFile = (workingDir: string) => {
  const filePath = join(workingDir, values.ignoreFileName);
  try {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    return fileData;
  } catch (e) {
    return '';
  }
};

export const writeSignatureFile = (workingDir: string, signature: string) => {
  const signatureFilePath = join(workingDir, signatureFileName);
  try {
    fs.writeFileSync(signatureFilePath, signature);
  } catch (e) {
    console.error('Could not write signature file');
    throw e;
  }
};
