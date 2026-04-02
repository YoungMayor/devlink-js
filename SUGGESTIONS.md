# Future Suggestions for @mayrlabs/devlink

This document outlines potential improvements and features to take `@mayrlabs/devlink` to the next level.

---

## 🎨 User Experience (CLI & UI)

### 1. Interactive Command Mode

- **What**: When running `devlink add` or `devlink remove` without arguments, show an interactive searchable list (using `enquirer` or `inquirer`) of available packages in the store.
- **Benefit**: Much faster for developers who don't remember exact package names.

### 2. Rich Progress Indicators

- **What**: Replace simple `console.log` with a progress bar (like `cli-progress`) for large package synchronization tasks.
- **Benefit**: Provides visual feedback during long `publish` or `add` operations.

### 3. "Did you mean?" Suggestions

- **What**: If a user typos a command or package name, use Levenshtein distance to suggest the closest match.
- **Benefit**: Reduces frustration from minor typos.

---

## ⚡ Performance & Reliability

### 1. High-Speed Globbing

- **What**: Replace the standard `glob` package with `fast-glob`.
- **Benefit**: Significantly faster file discovery in large monorepos with deep directory structures.

### 2. Content-Addressable Storage (CAS)

- **What**: Instead of copying entire folders, store files by their hash (like `pnpm` or `git` does) and use hardlinks/symlinks.
- **Benefit**: Massive reduction in disk space usage in `~/.mayrlabs/devlink` and nearly instant operations.

### 3. Native File System APIs

- **What**: Ensure all operations use the latest `node:fs/promises` features, specifically `fs.cp` with `errorOnExist: false` where applicable to avoid manual directory checks.

---

## 🛠️ Developer Workflow

### 1. `devlink check --fix`

- **What**: Add a `--fix` flag to the `check` command that automatically runs `devlink retreat` for any detected local dependencies.
- **Benefit**: Allows developers to "clean" their `package.json` before a commit with a single command.

### 2. Workspace Auto-Detection

- **What**: In monorepos, `devlink` could automatically detect if a local package is available in the store and suggest adding it if the version in `package.json` is a `workspace:` dependency.

### 3. Pre-Publish Hooks

- **What**: Allow users to define a `predevlinkpublish` script in their `package.json` to run specific build steps only for local devlink publishing.

---

## 🌐 Advanced Features

### 1. Remote "Team Store" (S3 / SSH)

- **What**: Allow configuring a remote storage backend (like an S3 bucket or a shared SSH drive) for the store.
- **Benefit**: Teams can share "local" packages without needing a full private NPM registry or Verdaccio setup.

### 2. Multi-Store Environments

- **What**: Support a `--store <name>` flag or a `DEVLINK_STORE` environment variable to switch between different isolated global stores.
- **Benefit**: Useful for contractors working for multiple clients who want to keep their local packages separate.

### 3. Formal Programmatic API

- **What**: Export a stable, documented TypeScript API for all core functions (add, publish, remove).
- **Benefit**: Allows other tools (like build scripts or custom CLIs) to integrate `devlink` logic natively.

---

## 🧪 Testing & Quality

### 1. Cross-PM Verification

- **What**: Extend the test suite to verify compatibility with `yarn v3/v4` (plug-and-play) and strict `pnpm` layouts.

### 2. OS Compatibility Matrix

- **What**: Add CI runners for Windows to ensure path-handling and symlink logic are robust across all operating systems.
