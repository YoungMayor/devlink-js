# 🛡️ Devlink

> [!IMPORTANT]
> **Devlink** is a modernized, high-performance local package development orchestrator.
> It provides a seamless workflow for using local packages in other projects without the constraints of `npm link` or `yarn link`.
>
> This is a modernized fork of the original [whitecolor/yalc](https://github.com/whitecolor/yalc) package, renamed and maintained as `@mayrlabs/devlink`.

---

## ⚡ Quick Start

Get up and running in seconds.

```bash
# Install globally
npm i -g @mayrlabs/devlink

# Go to your package and publish
cd my-package
devlink publish

# Go to your project and add the package
cd my-project
devlink add my-package
```

---

## Why

When developing and authoring multiple packages (private or public), you often find yourself in need of testing the latest/WIP versions in other projects that you are working on in your local environment **without publishing those packages to the remote registry.** NPM and Yarn address this issue with a similar approach of [symlinked packages](https://docs.npmjs.com/cli/link) (`npm/yarn link`). Though this may work in many cases, it often brings nasty [constraints and problems](https://github.com/yarnpkg/yarn/issues/1761#issuecomment-259706202) with dependency resolution, symlink interoperability between file systems, etc.

---

## 🎮 Interactive Mode (NEW)

Devlink now features a stunning interactive dashboard. Just run `devlink` without any arguments to enter a developer-friendly, guided experience.

```bash
devlink
```

> [!TIP]
> Use arrow keys to navigate, space to select options, and enter to confirm. It's smart enough to skip redundant prompts and guide you through complex flows.

---

## 📦 Core Features

### 🚀 High-Performance Publishing

Devlink uses `fast-glob` for lightning-fast file discovery. It respects your `.gitignore` and `.npmignore` files automatically—no extra configuration needed.

- **Watch Mode**: `devlink publish --watch` automatically republishes and pushes updates whenever you save a file.
- **Push Updates**: `devlink publish --push` propagates changes to all projects where the package is installed.

### 🏠 Local Package Store

All your published packages are kept in a central store at `~/.mayrlabs/devlink`. Use the `devlink store` command to browse, manage, and delete older versions.

### 🛠️ Smart Installations

- **Pure Mode**: Keeps your `package.json` clean while still allowing you to use local packages.
- **Git Integration**: Use `devlink git ignore` to automatically hide devlink files from your git history, or `devlink git show` to make them visible.

---

## 📖 Command Reference

| Command                      | Description                                        |
| :--------------------------- | :------------------------------------------------- |
| `devlink`                    | Launch the **Interactive Dashboard**               |
| `devlink publish`            | Publish current package to local store             |
| `devlink add <pkg>`          | Add a package from store to current project        |
| `devlink update`             | Update devlinked packages to latest local versions |
| `devlink update-all`         | Shortcut to update all packages to latest          |
| `devlink remove <pkg>`       | Remove a devlinked package from the project        |
| `devlink store`              | Manage the local package repository                |
| `devlink git <ignore\|show>` | Manage `.gitignore` for devlink files              |

---

## 🔐 Security & Constraints

- **Private Packages**: Devlink respects the `private: true` flag in `package.json` by default.
- **Signatures**: Use `--sig` to append a unique content hash to your version strings, preventing cache issues.
- **Scripts**: Lifecycle scripts like `prepare` and `prepublish` are executed unless `--no-scripts` is passed.

---

## Related links

- [yarn probably shouldn't cache packages resolved with a file path](https://github.com/yarnpkg/yarn/issues/2165)
- ["yarn knit": a better "yarn link"](https://github.com/yarnpkg/yarn/issues/1213)
- [npm-link-shared](https://github.com/OrKoN/npm-link-shared)
- [yarn link does not install package dependencies](https://github.com/yarnpkg/yarn/issues/2914)
- [[npm] RFC: file: specifier changes](https://github.com/npm/npm/pull/15900)

---

## ⚖️ License

MIT © [Aghogho Meyorn](https://aghogho.mayrlabs.com)
