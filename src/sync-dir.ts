import type * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { getFileHash } from './copy.js';

const cache: {
  [dir: string]: {
    glob: string[];
    files: {
      [file: string]: { stat: fs.Stats; hash: string };
    };
  };
} = {};

const makeListMap = (list: string[]) => {
  return list.reduce(
    (map, item) => {
      map[item] = true;
      return map;
    },
    {} as { [file: string]: true },
  );
};

const theSameStats = (srcStat: fs.Stats, destStat: fs.Stats) => {
  return (
    srcStat.mtime.getTime() === destStat.mtime.getTime() &&
    srcStat.size === destStat.size
  );
};

export const copyDirSafe = async (
  srcDir: string,
  destDir: string,
  compareContent = true,
) => {
  const options = {
    cwd: srcDir,
    ignore: ['**/node_modules/**'],
    dot: true,
    absolute: false,
    onlyFiles: false,
  };
  const srcList = cache[srcDir] ? cache[srcDir].glob : await fg('**', options);
  const destList = await fg('**', { ...options, cwd: destDir });
  const srcMap = makeListMap(srcList);
  const destMap = makeListMap(destList);

  const newFiles = srcList.filter((file: string) => !destMap[file]);
  const filesToRemove = destList.filter((file: string) => !srcMap[file]);
  const commonFiles = srcList.filter((file: string) => destMap[file]);
  cache[srcDir] = cache[srcDir] || {
    files: {},
    glob: srcList,
  };
  const filesToReplace: string[] = [];
  const srcCached = cache[srcDir].files;

  const dirsInDest: { [file: string]: boolean } = {};

  for await (const file of commonFiles) {
    srcCached[file] = srcCached[file] || {};
    const srcFilePath = resolve(srcDir, file);
    const destFilePath = resolve(destDir, file);
    const srcFileStat =
      srcCached[file].stat || (await fsPromises.stat(srcFilePath));
    srcCached[file].stat = srcFileStat;
    const destFileStat = await fsPromises.stat(destFilePath);

    const areDirs = srcFileStat.isDirectory() && destFileStat.isDirectory();
    dirsInDest[file] = destFileStat.isDirectory();

    const replacedFileWithDir =
      srcFileStat.isDirectory() && !destFileStat.isDirectory();
    const dirReplacedWithFile =
      !srcFileStat.isDirectory() && destFileStat.isDirectory();
    if (dirReplacedWithFile || replacedFileWithDir) {
      filesToRemove.push(file);
    }

    const compareByHash = async () => {
      const srcHash =
        srcCached[file].hash || (await getFileHash(srcFilePath, ''));
      srcCached[file].hash = srcHash;
      const destHash = await getFileHash(destFilePath, '');
      return srcHash === destHash;
    };
    if (
      dirReplacedWithFile ||
      (!areDirs &&
        !theSameStats(srcFileStat, destFileStat) &&
        (!compareContent || !(await compareByHash())))
    ) {
      filesToReplace.push(file);
    }
  }

  await Promise.all(
    filesToRemove
      .filter((file: string) => !dirsInDest[file])
      .map((file: string) =>
        fsPromises.rm(resolve(destDir, file), { recursive: true, force: true }),
      ),
  );
  await Promise.all(
    filesToRemove
      .filter((file: string) => dirsInDest[file])
      .map((file: string) =>
        fsPromises.rm(resolve(destDir, file), { recursive: true, force: true }),
      ),
  );

  const newFilesDirs = await Promise.all(
    newFiles.map((file: string) =>
      fsPromises
        .stat(resolve(srcDir, file))
        .then((stat: fs.Stats) => stat.isDirectory()),
    ),
  );

  // Create new directories first to avoid ENOENT for nested files
  await Promise.all(
    newFiles
      .filter((file: string, index: number) => newFilesDirs[index])
      .map((file: string) =>
        fsPromises.mkdir(resolve(destDir, file), { recursive: true }),
      ),
  );

  await Promise.all(
    newFiles
      .filter((file: string, index: number) => !newFilesDirs[index])
      .concat(filesToReplace)
      .map((file: string) =>
        fsPromises.cp(resolve(srcDir, file), resolve(destDir, file), {
          recursive: true,
        }),
      ),
  );
};
