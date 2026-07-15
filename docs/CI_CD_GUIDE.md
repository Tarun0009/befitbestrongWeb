# CI/CD Guide: beFitBeStrong

This guide explains the automation in this repository as a senior developer would
introduce it to a team. Follow it once to configure GitHub and the production host,
then use the shorter daily and release checklists.

## 1. The mental model

CI, release, and deployment are related but deliberately separate:

- **Continuous integration (CI)** proves that a proposed code change installs,
  type-checks, tests, and builds correctly.
- **Security automation** checks source code and dependency changes for known risks.
- **Release** creates versioned, immutable artifacts. Here, those artifacts are two
  container images in GitHub Container Registry (GHCR).
- **Continuous delivery** means a tested release is always ready to deploy.
- **Deployment** changes the running production system to a selected release.
- **Rollback** redeploys a previously published immutable release.

The implemented flow is:

```text
feature branch
      |
      v
pull request -> CI + security checks -> review -> merge to main
                                                   |
                                                   v
                                      signed/versioned Git tag
                                                   |
                                                   v
                                   CI quality gate runs again
                                                   |
                                                   v
                              GHCR images tagged with full Git SHA
                                                   |
                                                   v
                           protected manual production deployment
                                                   |
                                                   v
                              migration -> containers -> health checks
```

The production workflow is intentionally not triggered on every push to `main`.
For a commerce system with payments and database migrations, an immutable release
plus a protected production approval is a safer first professional setup.

## 2. Files and responsibilities

| File | Responsibility |
|---|---|
| `.github/workflows/ci.yml` | Reusable backend and frontend quality gate |
| `.github/workflows/security.yml` | CodeQL, dependency review, and registry audits |
| `.github/workflows/release.yml` | Builds and publishes versioned GHCR images |
| `.github/workflows/deploy-production.yml` | Protected deployment of one exact release SHA |
| `.github/dependabot.yml` | Weekly dependency and GitHub Actions update PRs |
| `.github/CODEOWNERS` | Records default code ownership |
| `.github/pull_request_template.md` | Makes testing, risk, and rollback visible in reviews |
| `deploy/scripts/deploy-release.sh` | Runs the server-side migration, startup, and health checks |
| `deploy/docker-compose.production.example.yml` | Production service topology |
| `deploy/.env.production.example` | Safe template for the ignored server environment file |

## 3. How CI works

`ci.yml` runs for pull requests targeting `main`, pushes to `main`, manual runs,
and calls from another workflow.

The backend and frontend jobs run in parallel. Each job:

1. Checks out the exact commit under review.
2. Installs the repository's pinned pnpm version.
3. Uses Node.js 20 and a pnpm dependency cache.
4. Installs from the lockfile with `--frozen-lockfile`.
5. Runs application-specific validation.

The backend generates Prisma Client, checks environment policy, type-checks, runs
Jest, and creates the production TypeScript build. The frontend type-checks and
runs `next build`.

CI uses harmless local placeholder URLs because it checks configuration shape and
does not connect to production services. Production credentials must never be used
for unit tests or builds.

`workflow_call` makes CI reusable. The release workflow calls the same quality gate
instead of copying its commands, so a normal pull request and a release tag follow
the same standard.

## 4. How security automation works

`security.yml` has three layers:

1. **CodeQL** analyzes JavaScript and TypeScript on pull requests, `main`, and a
   weekly schedule. The `security-extended` query suite trades a little speed for
   broader detection.
2. **Dependency review** runs on pull requests and blocks newly introduced
   dependencies with high or critical known vulnerabilities.
3. **Registry audit** checks production dependencies in both applications weekly
   and when manually requested.

Dependabot opens grouped weekly pull requests for backend packages, frontend
packages, Docker base images, and GitHub Actions. Treat those as normal
changes: read release notes, let CI run, test important journeys, and merge
intentionally. Never auto-merge a
major framework or payment-related dependency without review.

All third-party actions are pinned to full commit SHAs. A version comment remains
beside each SHA for readability, and Dependabot proposes future updates. SHA pins
reduce the risk of an action tag being moved to different code.

## 5. How releases work

`release.yml` runs only for tags matching `v*.*.*`, such as `v1.4.0`.
It refuses a tag whose commit is not contained in `main`.

It first calls CI. Only after CI succeeds does it build the backend and frontend
images. Each image receives:

- the full Git commit SHA, used by deployment;
- the semantic version, such as `1.4.0`;
- the major/minor channel, such as `1.4`.

The full SHA is the source of truth because it uniquely identifies source code and
cannot be confused with another version. Do not deploy a floating `latest` tag.

The images also include build provenance and an SBOM (software bill of materials).
GitHub-hosted build cache makes repeat builds faster without changing the artifact
identity.

`NEXT_PUBLIC_*` values are compiled into the browser bundle. Firebase Web SDK
values are public identifiers, so they belong in GitHub repository **variables**,
not secrets. Firebase Admin private keys, database passwords, Razorpay secrets,
and email credentials never enter the frontend build.

## 6. How production deployment works

`deploy-production.yml` can only be started manually. The operator must enter:

- a lowercase, full 40-character commit SHA; and
- the explicit `DEPLOY` confirmation.

The deploy job references the GitHub `production` environment. When that environment
has required reviewers, GitHub does not expose its environment secrets to the job
until approval is granted.

The workflow then:

1. Checks out the requested commit to prove it exists in the repository.
2. Verifies that backend and frontend images exist with that exact SHA.
3. Opens a host-key-pinned SSH connection.
4. Authenticates the deployment server to GHCR with read-only package access.
5. Fetches and detaches the server repository at the exact SHA.
6. Runs `deploy/scripts/deploy-release.sh`.

The server script validates Compose configuration, pulls images, starts PostgreSQL
and Redis, runs Prisma migrations once, starts the application containers without
building on the server, and checks both health endpoints. On failure it prints the
relevant service state and recent logs.

Production is serialized with a concurrency group, so two deployments cannot run
at the same time.

## 7. One-time GitHub configuration

Do these steps after the automation branch is reviewed and merged to `main`.

### 7.1 Actions policy

Open **Repository > Settings > Actions > General**.

1. Enable GitHub Actions.
2. Prefer an allow-list policy that permits GitHub-authored actions plus the
   `docker/*` and `pnpm/*` actions used here. If maintaining an allow list is not
   practical yet, allow required actions and reusable workflows.
3. Keep the default workflow token permission read-only. The release workflow
   explicitly requests only `packages: write`; other workflows request less.
4. Leave “Allow GitHub Actions to create and approve pull requests” disabled unless
   a reviewed automation use case later requires it.

### 7.2 Security features

Open **Settings > Advanced Security** (the exact available options depend on the
repository visibility and GitHub plan).

Enable:

- Dependency graph
- Dependabot alerts
- Dependabot security updates
- Secret scanning and push protection when available

This repository already contains an advanced CodeQL workflow. Do not also enable a
second default CodeQL setup, because that duplicates scans. Confirm that the first
`Security` workflow can upload results to **Security > Code scanning**.

Dependency review requires the dependency graph. If its job reports that the
feature is unavailable, enable the graph or check the repository plan/visibility.

### 7.3 Repository variables used to build the frontend

Open **Settings > Secrets and variables > Actions > Variables** and add:

| Variable | Example/meaning |
|---|---|
| `PUBLIC_API_URL` | `https://api.example.com` |
| `PUBLIC_SITE_URL` | `https://shop.example.com` |
| `FIREBASE_API_KEY` | Firebase Web SDK `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | Firebase Web SDK `authDomain` |
| `FIREBASE_PROJECT_ID` | Firebase Web SDK `projectId` |
| `FIREBASE_STORAGE_BUCKET` | Firebase Web SDK `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Web SDK `messagingSenderId` |
| `FIREBASE_APP_ID` | Firebase Web SDK `appId` |

Use exact public HTTPS URLs with no trailing slash. These names intentionally differ
from the local `NEXT_PUBLIC_*` names: the release workflow maps GitHub variables to
Docker build arguments.

### 7.4 Protected production environment

Open **Settings > Environments**, create `production`, and configure:

- Required reviewer(s), when the repository plan supports them
- “Prevent self-review” when at least two trusted maintainers are available
- Deployment branches/tags restricted to protected sources where supported
- No administrator bypass for a mature team, where supported

Add this environment variable:

| Variable | Meaning |
|---|---|
| `DEPLOY_PATH` | Absolute clone path on the host, for example `/srv/befitbestrong` |

`PUBLIC_SITE_URL` is already a repository variable and remains available to the
deployment job.

Add these environment secrets:

| Secret | Meaning |
|---|---|
| `DEPLOY_HOST` | Production hostname or IP address |
| `DEPLOY_USER` | Restricted SSH deployment user |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key dedicated to this deployment job |
| `DEPLOY_SSH_KNOWN_HOSTS` | Verified `known_hosts` line for the production host |
| `GHCR_USERNAME` | GitHub user allowed to read the private images |
| `GHCR_READ_TOKEN` | Classic PAT with only `read:packages` and required repository access |

Use a dedicated SSH key. Do not reuse a personal workstation key. Verify the server
host-key fingerprint through a trusted channel before storing the `known_hosts`
line; do not disable SSH host-key checking.

### 7.5 Protect `main`

Open **Settings > Rules > Rulesets** (or Branch protection rules) and protect
`main`:

1. Require changes through a pull request.
2. Require conversation resolution.
3. Require the `Backend quality`, `Frontend quality`, `CodeQL`, and
   `Dependency review` status checks after they have run at least once.
4. Block force pushes and branch deletion.
5. Require one approval when a second maintainer exists.
6. Enable code-owner approval when the project has another eligible reviewer.

Create a second ruleset for tags matching `v*.*.*`. Block tag updates and deletion,
limit tag creation to maintainers, and require signed tags when the team has Git signing
configured. A published release tag is historical evidence and must never be moved.

For a solo repository, requiring your own code-owner approval may deadlock changes.
Use required automated checks first, then add independent human approval as soon as
another maintainer or client engineer is available.

## 8. One-time production host configuration

The first target assumes a Linux server reachable through SSH.

1. Install Git, Docker Engine, Docker Compose v2, and curl.
2. Create a restricted deployment user and add only that user to the Docker group.
3. Add the dedicated public SSH key to that user's `authorized_keys`.
4. Clone this repository at the path stored in `DEPLOY_PATH`.
5. Create the ignored production environment file:

   ```bash
   cd /srv/befitbestrong
   cp deploy/.env.production.example deploy/.env.production
   chmod 600 deploy/.env.production
   ```

6. Fill every required value in `deploy/.env.production`. Copy individual Firebase
   Admin JSON fields; never place the complete service-account JSON in Git.
7. Put a TLS reverse proxy or load balancer in front of loopback ports 3005 and 4000.
8. Restrict firewall access to SSH, HTTP, and HTTPS as appropriate. PostgreSQL and
   Redis must not be public.
9. Back up PostgreSQL and test a restore before accepting real orders.

The server clone must not contain uncommitted application changes. Configuration
belongs in the ignored environment file or the host's infrastructure management.

## 9. First rollout, step by step

### Step A: review the automation itself

```bash
git switch -c chore/ci-cd-foundation
git add .github deploy docs README.md
git diff --cached --check
git commit -m "ci: add secure release and deployment pipelines"
git push -u origin chore/ci-cd-foundation
```

Open a pull request. Read every failed job rather than rerunning blindly. Merge only
after CI and security checks pass.

### Step B: create the first release

Configure GitHub variables before tagging, because frontend values are compiled at
image-build time.

```bash
git switch main
git pull --ff-only
git tag -a v0.1.0 -m "beFitBeStrong v0.1.0"
git push origin v0.1.0
git rev-parse "v0.1.0^{commit}"
```

Use a signed tag (`git tag -s`) when your Git signing key is configured. In GitHub,
open **Actions > Release images** and confirm both image jobs succeed. Copy the full
SHA printed by `git rev-parse`.

### Step C: deploy the release

1. Open **Actions > Deploy production > Run workflow**.
2. Paste the full release SHA.
3. Select `DEPLOY`.
4. Start the workflow.
5. Review and approve the `production` environment job, if protection is enabled.
6. Confirm the workflow health checks pass.
7. Manually smoke-test login, catalog, cart, checkout entry, admin access, and order
   viewing. Do not make a real payment unless a controlled production test is planned.

Record the release SHA, operator, time, and any observations in the deployment run
or your change-management system.

## 10. The normal senior-developer routine

For each change:

1. Pull the latest `main` and create a narrowly named feature branch.
2. Make one coherent change with tests.
3. Run relevant checks locally.
4. Inspect `git diff` for accidental secrets, generated files, and unrelated edits.
5. Commit with a message that explains intent.
6. Push and open a pull request using the supplied template.
7. Investigate failures; do not repeatedly rerun a deterministic failure.
8. Review code, migrations, operational risk, and rollback behavior.
9. Merge after required checks and approval.
10. Release related changes together with a semantic version tag.
11. Deploy the exact released SHA, observe health/logs, then smoke-test.

Useful local checks:

```bash
cd backend
pnpm prisma:generate
pnpm config:check
pnpm typecheck
pnpm test --runInBand --ci
pnpm build

cd ../frontend
pnpm typecheck
pnpm build
```

## 11. Versioning policy

Use semantic versions:

- `PATCH` (`v1.2.4`): backward-compatible bug fix
- `MINOR` (`v1.3.0`): backward-compatible feature
- `MAJOR` (`v2.0.0`): intentional breaking change

Do not delete or move a published version tag. If a release is bad, fix forward with
a new version or roll production back to an earlier full SHA.

## 12. Rollback

Application rollback uses the same production workflow:

1. Find a previously successful release SHA in GitHub deployment history or GHCR.
2. Confirm both images for that SHA still exist.
3. Run `Deploy production` with that older full SHA and `DEPLOY`.
4. Observe health checks and repeat smoke tests.

Database rollback is different. Prisma deployment migrations are normally forward
only. Design schema changes with the **expand-contract** pattern:

1. Expand: add new nullable columns/tables without removing old behavior.
2. Deploy code that can work during the transition.
3. Backfill and verify data.
4. Contract in a later release after old code can no longer run.

If a release contains a destructive or incompatible migration, rolling back only the
containers may fail. Such a migration needs a tested restore or corrective-migration
plan before production approval. Never improvise a destructive database rollback.

## 13. Failure playbook

### CI install fails

- Confirm `package.json` and `pnpm-lock.yaml` were committed together.
- Run `pnpm install --frozen-lockfile` locally.
- Do not remove the frozen lockfile flag to hide drift.

### Frontend release build says variables are missing

- Check all repository variables in section 7.3.
- Verify URLs use public HTTPS origins and contain no trailing slash.
- Create a new tag after fixing configuration; do not move the old tag.

### GHCR push is denied

- Check the workflow has `packages: write`.
- Check repository or organization Actions policy.
- Confirm the package is linked to and accessible by this repository.

### Deployment cannot pull an image

- Confirm the SHA came from a successful `Release images` run.
- Confirm the server token has `read:packages` and repository access.
- Confirm package visibility/access grants include the repository or token owner.

### SSH fails

- Check host, user, firewall, and dedicated public key.
- Verify `DEPLOY_SSH_KNOWN_HOSTS`; do not use `StrictHostKeyChecking=no`.
- Confirm the deployment user can run Docker and read the clone.

### Migration fails

- Stop. Read the migration container logs printed by the workflow.
- Check database backup status and schema state.
- Fix with a reviewed corrective migration; do not mark a failed migration as
  applied unless you fully understand its database effect.

### Health checks fail

- Read backend/frontend logs in the workflow diagnostics.
- Check DNS/TLS separately from loopback container health.
- Inspect `/health/ready` for backend dependency readiness.
- Roll back to a compatible released SHA if customer impact continues.

## 14. Practice exercises

Complete these in order:

1. Open a documentation-only pull request and identify each workflow trigger.
2. Intentionally introduce a TypeScript error, watch CI fail, then fix it in the same
   branch.
3. Read a Dependabot PR and explain the lockfile changes before merging.
4. Run the Security workflow manually and locate its CodeQL and audit output.
5. Build a prerelease tag on a test branch only after changing the tag pattern in a
   temporary workflow; do not use a production tag for experiments.
6. On a disposable server, deploy a release, deploy a newer release, then roll back
   to the first SHA.
7. Add a `staging` GitHub environment and a separate staging host before introducing
   production auto-promotion.
8. Design an expand-contract migration and write down the safe deployment and
   rollback order.

## 15. Natural next improvements

After this foundation is stable:

- add integration tests with PostgreSQL and Redis service containers;
- add a protected staging deployment and automated browser smoke tests;
- send deployment and failure notifications to the team's incident channel;
- collect structured logs, metrics, traces, uptime checks, and business alerts;
- use cloud workload identity/OIDC instead of long-lived cloud credentials when the
  deployment target supports it;
- add image vulnerability scanning and signed artifact verification;
- use blue/green or canary deployment when traffic justifies the complexity.

Add these only when the team can operate them. A short, observable pipeline that the
team understands is stronger than a complicated pipeline nobody trusts.

## 16. Official references

- [GitHub reusable workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Working with GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Configure code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning)
- [Configure Dependabot version updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates)
- [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
