import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ini from 'ini';
import { values } from './index.js';

const validFlags = [
  'sig',
  'workspace-resolve',
  'dev-mod',
  'scripts',
  'quiet',
  'files',
];

const fileName = '.mayrlabs/devlinkrc';

const readFile = (): Record<string, string | boolean> | null => {
  if (existsSync(fileName)) return ini.parse(readFileSync(fileName, 'utf-8'));

  return null;
};

export const readRcConfig = (): Record<string, string | boolean> => {
  const rcOptions = readFile();
  if (!rcOptions) return {};

  const unknown = Object.keys(rcOptions).filter(
    (key) => !validFlags.includes(key),
  );

  if (unknown.length) {
    console.warn(`Unknown option in ${fileName}: ${unknown[0]}`);
    process.exit();
  }

  return Object.keys(rcOptions).reduce<Record<string, string | boolean>>(
    (prev, flag) => {
      if (validFlags.includes(flag)) {
        prev[flag] = rcOptions[flag];
      }
      return prev;
    },
    {},
  );
};
