# Contributing

Thanks for helping improve VueSortable.

## Development

Use Node.js 22 or 24 and pnpm 10.17.1:

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
