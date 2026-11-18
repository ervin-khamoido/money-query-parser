# Releases and documentation deployment

Repository: https://github.com/ervin-khamoido/money-query-parser

Documentation: https://ervin-khamoido.github.io/money-query-parser/

npm package: https://www.npmjs.com/package/money-query-parser

## Prepare a version

Update `package.json` and the lockfile together. Add a dated entry at the top of `CHANGELOG.md`; `build:site` requires its version to match the package. Document interpretation changes even if the TypeScript surface is unchanged. During 0.x, review compatibility explicitly rather than assuming all minor versions are interchangeable.

```sh
npm ci
npm run check
npm run check:package
npm run demo
npm run build:site
npm run preview:site
npm pack
```

Inspect the page and tarball before publishing. The package check installs the actual tarball offline and verifies ESM imports and shipped declarations in a separate consumer. `prepack` runs type checks and tests for real packing/publishing. Only compiled modules, declarations, README, LICENSE and metadata are included in npm.

Push the candidate commit, wait for CI on Node 22/24/26, then create its matching tag, such as `v0.1.0`. The npm version must not already exist: published versions cannot be overwritten.

## npm publishing

The first release can be made interactively by the package owner:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami
npm publish --access public
```

Complete any npm browser/2FA challenge. Verify registry metadata, install the published version into a fresh project, and run a real import before announcing the release.

An [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/) is configured for this repository with:

- GitHub owner: `ervin-khamoido`
- Repository: `money-query-parser`
- Workflow filename: `publish.yml`
- Environment: leave empty (the workflow does not declare one)

The manual **Publish npm** workflow checks an existing version tag, validates the package and uses OIDC with provenance. It requires the npm-side trusted publisher configuration; connecting a GitHub profile to an npm account is a separate setting. No long-lived npm token is stored in this repository. The workflow deliberately does not run on every push or GitHub release creation.

Create a GitHub release for the tag with the changelog notes and optional tarball. Keep the registry version, package version, tag and release notes consistent.

## Documentation

`site/` contains buildless HTML, CSS and browser JavaScript. `npm run build:site` builds the library and copies its exact JavaScript into `site/dist/library/`. It generates release notes from `CHANGELOG.md` and copies the PostgreSQL example with only its import path changed. There are no external scripts, analytics or CDN dependencies.

Enable GitHub Pages with GitHub Actions as its source. The **Documentation** workflow runs after successful main-branch push CI and deploys `site/dist`. It can also be started manually. It checks out the tested commit rather than an unrelated latest branch state. A failed CI run does not publish a website.

For a documentation-only correction, edit `site/` or the documentation, push to main, and wait for CI/deployment. For a new package release, update package metadata and the changelog before building. The version on the site comes from `package.json`.

An additional Sites-hosted presentation can use the same static build. GitHub Pages is the canonical documentation URL and the automatically updated deployment.
