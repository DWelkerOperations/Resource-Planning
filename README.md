# Dispatch Tool

Modern frontend prototype for airline catering dispatch and transportation resource planning.

## V1.1 Resource Planning

V1.1 is the current Resource Planning deployment baseline. It is configured for GitHub Pages and includes a lightweight front-end password gate for shared review access.

## v1.0 Baseline

Dispatch Tool v1.0 is the stable generic dispatch/resource planner prototype baseline, anchored at commit `9cd1e6f` (`Stabilize generic dispatch planner prototype`). It is a return point for future work, not a finished production system.

## Current v1.0 Scope

- React + TypeScript + Tailwind CSS
- Frontend only
- Excel schedule import
- Resource Guide for imported/sample schedules, recommended resource starts, pairing quality, risk definitions, timeline, push plan, exceptions, and Excel export
- Planning Tool for full-day pairing/resource-plan review
- Dispatch Tool for loading a planning result or recalculating from available resource counts
- Staffing, Fleet, Exceptions, Dashboard, Tour Sheet, and Thumb Rules views
- Thumb-rule driven resource guidance
- Generic site support with site-specific behavior in `planningRules.siteOverrides`
- Scheduler test harness covering core pairing, risk, shortage, site override, shared resource pool, lunch-window, and critical-rejection behavior
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass for the v1.0 baseline
- Live dispatching is intentionally out of scope for now
- Embedded PDX and ORD schedules are sample/reference data, not product-specific scope

## Known v1.0 Limitations

- No backend, database, or persistence
- No web authentication
- No production deployment workflow
- Driver iPhone app is a separate prototype and is not integrated
- Apple TV dashboard is a separate prototype and is not integrated
- Internal `kitchen*` model field names remain for compatibility; see [model compatibility notes](docs/model-compatibility.md)
- Scheduler tests are useful but not exhaustive
- PDX June 11, 2026 and ORD May 14, 2026 are sample/reference datasets only

## Local development

```bash
pnpm install
pnpm dev
```

## GitHub Pages deployment

This app deploys to GitHub Pages from the `main` branch with the workflow in `.github/workflows/deploy-pages.yml`.

Expected public URL after Pages is enabled:

```text
https://dwelker123-glitch.github.io/Dispatch-Tool/
```

Expected beta URL when the `v1.1Beta` branch exists:

```text
https://dwelker123-glitch.github.io/Dispatch-Tool/v1.1Beta/
```

Deployment behavior:

- Viewers do not need a GitHub account or GitHub login.
- The stable shared page updates only after code is committed and pushed to `main`.
- The beta page updates after code is committed and pushed to `v1.1Beta`.
- The GitHub Actions workflow installs dependencies, runs checks, builds stable with the `/Dispatch-Tool/` base path, builds beta with the `/Dispatch-Tool/v1.1Beta/` base path when the beta branch exists, and publishes both into one Pages artifact.
- Use `workflow_dispatch` from GitHub Actions if a manual redeploy of the current `main` commit is needed.

One-time GitHub repository setup:

1. Open the repository on GitHub.
2. Go to Settings -> Pages.
3. Under Build and deployment, set Source to GitHub Actions.
4. Save the setting, then push to `main` or run the deploy workflow manually.

Future update flow:

```bash
git status
pnpm typecheck
pnpm test
pnpm build
git add .
git commit -m "Describe the update"
git push origin main
```

If you work on a feature branch first, merge that branch into `main` and push `main` to update the shared page.

## Lightweight access gate

The deployed app shows a password screen before the planning workspace is displayed. Successful access is remembered in browser local storage so reviewers do not need to re-enter the password on every refresh.

This is lightweight access friction only. It is not true security, authentication, authorization, or data protection. Do not treat the GitHub Pages site as private.

## Data and secrets warning

Do not commit secrets, API keys, credentials, private staffing files, real employee data, customer data, sensitive schedules, or sensitive operational data. This app is frontend-only and GitHub Pages publishes static files to anyone who has the URL and password.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Tagging v1.0

After committing this documentation alignment, create and push the v1.0 tag:

```bash
git tag -a v1.0 -m "Dispatch Tool v1.0 - Stable generic dispatch planner baseline"
git push origin v1.0
```
