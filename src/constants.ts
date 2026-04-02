export const values = {
  myNameIs: 'devlink',
  myNameIsCapitalized: 'Devlink',
  lockfileName: 'devlink.lock',
  devlinkPackagesFolder: '.mayrlabs/devlink',
  rcFileName: '.mayrlabs/.devlinkrc',
  storeFileName: 'store.json',
  prescript: 'predevlink',
  postscript: 'postdevlink',
  installationsFile: 'installations.json',
  validFlags: [
    'sig',
    'workspace-resolve',
    'dev-mod',
    'scripts',
    'quiet',
    'files',
  ],
} as const;

export type Values = typeof values;
export const validFlags = values.validFlags;
