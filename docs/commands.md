# CLI Commands Reference

`devlink` (aliased as `lpm`) provides a set of commands to manage local package dependencies.

## Universal Options

- `--quiet`: Disable all output except errors.
- `--no-colors`: Disable colored output.
- `--store-folder <path>`: Override the default package store location.

---

## Commands

### `publish [folder]`

Publish a package to the local devlink store.

- **Args**: `folder` (optional) - defaults to current directory.
- **Flags**:
  - `--sig`: Calculate and use a hash signature in the version.
  - `--no-scripts`: Skip lifecycle scripts (`prepublish`, `prepare`, etc.).
  - `--changed`: Only publish if content has changed.
  - `--content`: Show included files in the console.
  - `--push`: Automatically propagate updates to all project installations.

### `push [folder]`

Shortcut for `publish --push`. Publishes and immediately updates all installations of the package.

- **Flags**: Same as `publish`, plus:
  - `--replace`: Force package content replacement in installations.

### `add [package1 [package2 ...]]`

Add one or more packages from the devlink store to the current project.

- **Flags**:
  - `--dev` (`-D`): Add as a `devDependency`.
  - `--link`: Use `link:` protocol instead of `file:`.
  - `--workspace` (`-W`): Use `workspace:` protocol.
  - `--pure`: Do not touch `package.json` or `node_modules` (useful for monorepos).
  - `--update` (`--upgrade`): Run package manager update after adding.

### `link [package1 [package2 ...]]`

Similar to `add` but creates a symlink in `node_modules` instead of modifying `package.json`.

### `update [package1 [package2 ...]]`

Update specified packages (or all in `devlink.lock`) from the store.

- **Flags**:
  - `--update` (`--upgrade`): Run package manager update after updating.

### `remove [package1 [package2 ...]]`

Remove packages from the project and `devlink.lock`.

- **Flags**:
  - `--all`: Remove all devlink packages from the project.
  - `--retreat`: Remove from project but keep in `devlink.lock` for later restoration.

### `retreat [--all]`

Shortcut for `remove --retreat`. Removes packages from the directory but preserves the lock file state.

### `restore`

Restore previously retreated packages.

### `installations <action> [package]`

Manage the devlink installations tracking file.

- **Actions**:
  - `show [package]`: Show where a package is installed.
  - `clean [package]`: Remove stale/missing installation paths.
- **Flags**: `--dry` (for `clean`) to see what would be removed.

### `check [--commit]`

Check `package.json` for any devlink-injected dependencies. Useful for pre-commit hooks.

- **Flags**: `--commit` (internal use).

### `dir`

Show the path to the global devlink store directory.
