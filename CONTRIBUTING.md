# Contributing

Thanks for helping improve VueSortable.

## Development

Use Node.js 22.22.2+ or 24.15+ and pnpm 10.17.1 (the test DOM, jsdom 30, requires them):

```bash
corepack enable
pnpm install --frozen-lockfile
```

Before opening a pull request, run the full local check:

```bash
pnpm run ci
```

The CI command runs type checking, tests, the production build, bundle-size checks, package linting, dry packaging and the Nuxt SSR fixture.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update a regression test for behavior changes.
- Update the README when the public API or supported behavior changes.
- Do not commit generated `dist`, `.nuxt`, `.output` or coverage files.
- Keep the public package contract compatible unless the change is intentional and documented.

Use the issue templates for reproducible bugs and feature proposals. For security reports, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Maintainer-only release operations

Contributors only need the development and pull-request steps above. Repository settings, npm access, release tags and staged-package approval are maintainer-only operations.

### Release security configuration

- Protect `main` with the required checks `Test (22)` and `Test (24)`. Protect release tags matching `v*`: restrict their creation to the maintainer and prevent tag updates and deletion.
- Create the GitHub environment `npm`, allow deployment only from tags matching `v*` (not branches), and require `guillemservera` to approve deployment. Allow self-review for this single-maintainer repository and disable administrator bypass. The workflow references this environment explicitly; creating an environment without protection rules is not sufficient.
- In the npm package's Trusted Publishing settings, bind GitHub Actions to owner `guillemservera`, repository `vue-sortable`, workflow `release.yml` and environment `npm`. Allow `npm stage publish` only, not direct `npm publish`.
- Keep npm account 2FA enabled, require 2FA and disallow publishing tokens at package level, and remove obsolete publishing tokens. Do not add an `NPM_TOKEN` repository secret.
- Trusted Publishing requires an existing npm package. For a new package only, a maintainer must bootstrap its first publication locally with npm authentication and 2FA, then configure the trusted publisher before using this workflow. This package already exists; normal releases must use staging.

### Releasing a version

1. Bump `version` in `package.json` in a pull request (`chore(release): x.y.z`) and merge it after the required CI checks pass.
2. Publish a GitHub release with tag `vx.y.z` on that merged commit. The tag must match the package version exactly, including any prerelease suffix.
3. `.github/workflows/release.yml` verifies that the release commit belongs to `origin/main` and that the tag matches `package.json` before installing dependencies or running package code. Its build job has no OIDC permission, runs the full `pnpm run ci`, and produces and validates a real package tarball.
4. Review the successful build and approve the `npm` environment deployment. Its staging job downloads that exact artifact by ID, checks its SHA-256 digest and stages the tarball with npm 12, provenance and lifecycle scripts disabled. It does not check out source or rebuild. GitHub prereleases and versions with prerelease suffixes use `next`; other releases use `latest`.
5. Inspect the workflow and staged package (`npm stage view <id>`; use `npm stage download <id>` to inspect its contents). Approve with 2FA on npmjs.com (package → Staged) or with `npm stage approve <id>`; only then is the version published. Reject an unexpected package with `npm stage reject <id>` instead.

The GitHub environment and npm trusted-publisher binding are both required: the workflow file alone does not configure either remote control.
