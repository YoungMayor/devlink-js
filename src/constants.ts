export const values = {
  myNameIs: 'devlink',
  myNameIsCapitalized: 'Devlink',
  ignoreFileName: '.mayrlabs/.devlinkignore',
  lockfileName: 'devlink.lock',
  devlinkPackagesFolder: '.mayrlabs/devlink',
  rcFileName: '.mayrlabs/.devlinkrc',
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
