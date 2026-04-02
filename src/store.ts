import * as fs from 'node:fs';
import { join } from 'node:path';
import { getStoreMainDir, values } from './index.js';

export interface StorePackageVersion {
  version: string;
  publishedAt: string;
  installations: number;
}

export interface StorePackage {
  name: string;
  versions: Record<string, StorePackageVersion>;
}

export interface StoreData {
  packages: Record<string, StorePackage>;
}

export function getStoreFilePath(): string {
  return join(getStoreMainDir(), values.storeFileName);
}

export function readStore(): StoreData {
  const filePath = getStoreFilePath();
  if (!fs.existsSync(filePath)) {
    return { packages: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error('Could not read store file');
    return { packages: {} };
  }
}

export function writeStore(data: StoreData): void {
  const filePath = getStoreFilePath();
  const dir = getStoreMainDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function updatePackageInStore(name: string, version: string): void {
  const store = readStore();
  if (!store.packages[name]) {
    store.packages[name] = { name, versions: {} };
  }
  store.packages[name].versions[version] = {
    version,
    publishedAt: new Date().toISOString(),
    installations: store.packages[name].versions[version]?.installations || 0,
  };
  writeStore(store);
}

export function incrementInstallation(name: string, version: string): void {
  const store = readStore();
  if (store.packages[name]?.versions[version]) {
    store.packages[name].versions[version].installations++;
    writeStore(store);
  }
}

export function decrementInstallation(name: string, version: string): void {
  const store = readStore();
  if (store.packages[name]?.versions[version]) {
    store.packages[name].versions[version].installations = Math.max(
      0,
      store.packages[name].versions[version].installations - 1,
    );
    writeStore(store);
  }
}

export function removePackageVersionFromStore(
  name: string,
  version: string,
): void {
  const store = readStore();
  if (store.packages[name]?.versions[version]) {
    delete store.packages[name].versions[version];
    if (Object.keys(store.packages[name].versions).length === 0) {
      delete store.packages[name];
    }
    writeStore(store);
  }
}
