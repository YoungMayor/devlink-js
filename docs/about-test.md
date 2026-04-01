# Testing @mayrlabs/devlink

The test suite for `devlink` is built with **Mocha** and performs integration-level testing of the CLI routines by simulating real-world package management scenarios.

## Test Structure

- **`test/index.ts`**: The main test entry point containing all `describe` and `it` blocks.
- **`test/fixture/`**: Contains baseline project/package structures used as a starting point for tests.
- **`test/tmp/`**: A temporary working directory created before each test run. Fixtures are copied here to ensure isolation.

## Key Test Procedures

### 1. Lifecycle Isolation

Before each test run, the `tmp/` directory is cleared and the `fixture/` directory is copied over. This ensures that every test run starts with a clean slate.

### 2. Global Store Mocking

The tests override the global devlink store directory to point to `test/tmp/devlink-store`. This prevents the tests from interfering with the developer's actual `~/.mayrlabs/devlink` folder.

### 3. Core Functional Testing

The suite covers the following areas:

- **Publishing**: Verifies that `devlink publish` correctly harvests files (respecting `package.json#files`), generates signatures, and handles `workspace:` protocol resolution.
- **Adding/Linking**: Verifies that `devlink add` and `devlink link` correctly inject dependencies into `package.json`, update `devlink.lock`, and tracking installations.
- **Updating**: Ensures that `devlink update` correctly synchronizes files from the store.
- **Removing/Retreating**: Tests the cleanup routines and the "retreat/restore" workflow which allows temporary removal of devlink dependencies.

## Running Tests

To run the full test suite, use:

```bash
pnpm test
```

This will trigger the `mocha` test runner on the `test` directory.
