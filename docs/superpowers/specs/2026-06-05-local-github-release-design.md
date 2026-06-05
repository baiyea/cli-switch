# Local GitHub Release Design

## Purpose

Cli-Switch should not use GitHub Actions to build release packages. Builds stay local so macOS and Windows packaging continue to run in the intended native environment. After a local `pnpm dist:*` command produces artifacts under `release/`, a separate local script uploads the selected artifacts to GitHub Releases through the GitHub REST API.

## Confirmed Decisions

- Remove the GitHub Actions release workflow so pushing tags does not trigger cloud packaging.
- Keep existing `pnpm dist:mac:x64`, `pnpm dist:mac:arm64`, and `pnpm dist:win` scripts as local packaging commands.
- Add a separate `pnpm release:github` command for publishing already-built artifacts.
- Derive the release tag from `package.json` version, for example `0.1.8` becomes `v0.1.8`.
- Read the GitHub token from `.env` as `GITHUB_TOKEN`.
- Upload only artifacts matching the current package version.
- If the GitHub release already exists, update it and replace same-name assets.
- If the release/tag does not exist, create it for the current local `HEAD`, after verifying that `HEAD` exists on the GitHub remote.
- Publish directly as a normal release, not a draft and not a prerelease.
- Require an interactive confirmation before uploading any files.

## Architecture

The implementation should add one local release script:

- `scripts/github-release.js`: owns all GitHub Release API calls, local artifact discovery, confirmation prompts, and upload orchestration.

The package script should be:

- `release:github`: runs `node scripts/github-release.js`.

The existing dist scripts remain unchanged. This keeps packaging and publishing separate:

- Packaging writes local files into `release/`.
- Publishing reads local files from `release/` and talks to GitHub.

## Data Flow

1. Read `package.json`.
2. Derive `version` and `tagName`.
3. Read `GITHUB_TOKEN` from `.env`.
4. Resolve the GitHub repository from `git remote get-url origin`.
5. Verify local `HEAD` exists on the GitHub remote.
6. Scan `release/` for current-version artifacts.
7. Print tag, repository, target commit, artifact list, and sizes.
8. Ask for explicit confirmation.
9. Find an existing release by tag, or create a new release.
10. For each selected artifact, delete an existing same-name asset if present, then upload the local file.

## Artifact Selection

The script should upload only files for the current version. Supported examples:

- `release/*-0.1.8.dmg`
- `release/*-0.1.8.dmg.blockmap`
- `release/*-0.1.8.exe`
- `release/*-0.1.8.exe.blockmap`
- `release/latest*.yml`

The script should not upload old version artifacts, builder debug files, extracted app directories, or unrelated files.

## Error Handling

The script should fail before touching GitHub when:

- `GITHUB_TOKEN` is missing.
- `origin` is not a GitHub repository URL.
- The current package version is missing or invalid.
- No matching artifacts exist in `release/`.
- Local `HEAD` cannot be found on the remote.

During upload:

- Same-name release assets should be deleted before replacement.
- Any failed upload should stop the script and print the failed asset name.
- The script should not remove local files.

## Security

The GitHub token must not be printed. Error messages should identify missing or unauthorized token states without echoing the token value.

## Testing

Unit tests should cover pure helpers where practical:

- Version to tag conversion.
- GitHub remote URL parsing.
- Artifact selection for current version only.
- Confirmation bypass behavior should not be included unless an explicit non-interactive flag is added later.

Manual verification should include:

- Run a local `pnpm dist:*` command.
- Run `pnpm release:github`.
- Confirm the script lists only current-version assets.
- Confirm existing same-name assets are replaced on GitHub Release.

## Out Of Scope

- No GitHub Actions cloud build.
- No automatic local packaging inside the publish script.
- No automatic `git push`.
- No signing or notarization changes.
- No changelog generation beyond the release title/body used by the upload script.
