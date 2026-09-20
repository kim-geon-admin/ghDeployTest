# Synology GitHub Actions CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure `ghDeployTest` to build immutable GHCR images on `main` pushes and deploy them to Synology through a restricted SSH gate with health checks and automatic rollback.

**Architecture:** GitHub Actions runs `npm test`, builds the existing root `Dockerfile` as `ghcr.io/kim-geon-admin/ghdeploytest-app` with a 40-character commit SHA tag, and sends only `deploy` followed by that SHA to the NAS. The NAS `test-deploy` account is restricted to `deploy-gate.sh`; a single sudo rule invokes the root `deploy.sh`, which pulls first, swaps the Compose stack on `127.0.0.1:3200`, checks `/health`, and rolls back to the previous SHA on failure.

**Tech Stack:** Node.js 22, Docker Compose, GitHub Actions, GHCR, Synology DSM 7 Container Manager, POSIX shell/Bash, GitHub Actions pinned by commit SHA.

**Spec:** `docs/superpowers/specs/2026-09-20-synology-cicd-design.md`

## Global Constraints

- Repository is `kim-geon-admin/ghDeployTest`; project and Compose name are `ghdeploytest`.
- NAS is `nayaguny.synology.me` on SSH port `2233`; DSM administrator is `nayaguny`; the dedicated deployment user is `test-deploy`.
- NAS deployment directory is `/volume1/docker/ghdeploytest`.
- NAS binding is `127.0.0.1:3200`; the container listens on port `3000`; DSM reverse proxy terminates external HTTPS.
- The only service built and deployed is `app` from `./Dockerfile`.
- The application health endpoint is `/health`; no persistent data volume or backup file is configured.
- Images are tagged only with 40-character lowercase commit SHAs; no `latest` tag is used.
- CI uses `GITHUB_TOKEN` for GHCR and never stores registry credentials on the NAS.
- SSH must use `StrictHostKeyChecking=yes` with the `NAS_SSH_KNOWN_HOSTS` secret.
- The `test-deploy` SSH key accepts only `deploy` followed by a 40-character lowercase SHA and cannot open a shell, use SFTP, forward ports, or run arbitrary sudo commands.
- Shell scripts use LF line endings; the NAS installation strips CRLF before setting executable permissions.

## Review Focus

- A non-deploy SSH request must be rejected without invoking sudo; test with an empty command, `sh`, `scp`, and a SHA containing uppercase characters.
- An invalid or missing 40-character SHA must be rejected before any Docker command; test `deploy deadbeef`, a 40-character uppercase SHA, and a 40-character lowercase SHA.
- Compose must not reference a nonexistent data directory; render it with `HTTP_BIND=127.0.0.1:3200` and a 40-character SHA and assert configuration succeeds.
- A GHCR pull failure must leave the existing stack untouched; run the mock-Docker scenario suite and check its failure case.
- A failed post-swap health check must restore the previous image tag; run the mock-Docker rollback scenario and inspect the recorded current/previous tags.

---

### Task 1: Add the NAS Compose contract and repository hygiene

**Files:**
- Create: `infra/synology/compose.yaml`
- Create: `infra/synology/.env.example`
- Create: `.gitattributes`
- Create: `.gitignore`

**Interfaces:**
- Consumes: root `Dockerfile`, service name `app`, container port `3000`, application endpoint `/health`.
- Produces: Compose project `ghdeploytest` with image contract `ghcr.io/kim-geon-admin/ghdeploytest-app:${IMAGE_TAG}` and NAS binding `127.0.0.1:3200:3000`.

- [ ] **Step 1: Create the Compose and environment files with the exact deployment values.**

  `infra/synology/compose.yaml` must contain `name: ghdeploytest`, one `app` service, the image `ghcr.io/kim-geon-admin/ghdeploytest-app:${IMAGE_TAG:?IMAGE_TAG is set by deploy.sh}`, `restart: unless-stopped`, `read_only: true`, `no-new-privileges:true`, `/tmp` tmpfs, `"${HTTP_BIND:-127.0.0.1:3200}:3000"`, `PORT=3000`, and this health check:

  ```yaml
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 30s
  ```

  `infra/synology/.env.example` must contain exactly:

  ```dotenv
  HTTP_BIND=127.0.0.1:3200
  ```

- [ ] **Step 2: Add repository hygiene rules.**

  `.gitattributes` must contain `*.sh text eol=lf`. `.gitignore` must contain `.env`, `infra/synology/.env`, `deploy.config.json`, and `infra/synology/deploy.config.json`, without ignoring tracked `.env.example`.

- [ ] **Step 3: Render the Compose file before adding deployment scripts.**

  Run from Git Bash at the repository root:

  ```bash
  IMAGE_TAG=0123456789abcdef0123456789abcdef01234567 docker compose --env-file infra/synology/.env.example -f infra/synology/compose.yaml config -q
  ```

  Expected result: exit code `0` and no configuration error. If Docker is unavailable, run the same check after Docker Desktop is started; do not replace it with an unverified text-only check.

- [ ] **Step 4: Commit the Compose contract.**

  ```bash
  git add .gitattributes .gitignore infra/synology/compose.yaml infra/synology/.env.example
  git diff --cached --check
  git commit -m "chore: add Synology compose contract"
  ```

### Task 2: Add the restricted NAS deployment scripts

**Files:**
- Create: `infra/synology/deploy-gate.sh`
- Create: `infra/synology/deploy.sh`

**Interfaces:**
- Consumes: `SSH_ORIGINAL_COMMAND`, stdin lines containing the GHCR username and job-scoped token, `/volume1/docker/ghdeploytest/compose.yaml`, and `/volume1/docker/ghdeploytest/.env`.
- Produces: a forced command consisting of `deploy` plus a 40-character SHA and root deployment behavior for the corresponding `ghcr.io/kim-geon-admin/ghdeploytest-app` image tag.

- [ ] **Step 1: Add the gate from the approved template with literal project paths.**

  The gate must set `PATH=/usr/sbin:/usr/bin:/sbin:/bin`, reject every `SSH_ORIGINAL_COMMAND` except `deploy ` followed by a SHA, reject any non-lowercase-hex character and any length other than 40, and finish with:

  ```sh
  exec sudo -n /volume1/docker/ghdeploytest/bin/deploy.sh "$tag"
  ```

- [ ] **Step 2: Add the deployment script with the project settings block.**

  Copy the skill template implementation into `infra/synology/deploy.sh` and set the literal block to:

  ```bash
  readonly PROJECT=ghdeploytest
  readonly IMAGE_PREFIX=ghcr.io/kim-geon-admin/ghdeploytest
  readonly SERVICES=(app)
  readonly BACKUP_FILES=()
  readonly HEALTH_TIMEOUT_SECONDS=120
  readonly STABLE_SECONDS=15
  readonly MIN_FREE_MB=3072
  readonly KEEP_BACKUPS=5
  readonly KEEP_LOGS=20
  ```

  Keep the template behavior that runs the real work detached, uses a temporary `DOCKER_CONFIG`, validates the Compose file before stopping the stack, pulls every service before replacement, checks container health and restart stability, records `state/current-tag` and `state/previous-tag`, retains the current and rollback images, and rolls back when replacement or verification fails. Do not add a data backup path because this app has no persistent data.

- [ ] **Step 3: Normalize and syntax-check the scripts.**

  Run from Git Bash:

  ```bash
  sed -i 's/\r$//' infra/synology/deploy.sh infra/synology/deploy-gate.sh
  bash -n infra/synology/deploy.sh
  sh -n infra/synology/deploy-gate.sh
  ```

  Expected result: all commands exit `0` with no syntax output.

- [ ] **Step 4: Run the skill's mock-Docker scenario suite against the customized scripts.**

  Run from Git Bash with Docker Desktop running:

  ```bash
  bash skills-repo/synology-github-actions-docker-deploy/scripts/test-deploy.sh infra/synology/deploy.sh infra/synology/deploy-gate.sh
  ```

  Expected result: the scenario runner reports every scenario as `PASS` and exits `0`. This must cover invalid gate input, first deployment, pull failure, health failure, rollback, stale lock recovery, and image cleanup.

- [ ] **Step 5: Commit the deployment scripts.**

  ```bash
  git add infra/synology/deploy.sh infra/synology/deploy-gate.sh
  git diff --cached --check
  git commit -m "feat: add restricted Synology deploy scripts"
  ```

### Task 3: Add the pinned GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: root `Dockerfile`, `npm test`, GitHub `GITHUB_TOKEN`, and the five NAS secrets `NAS_SSH_HOST`, `NAS_SSH_PORT`, `NAS_SSH_USER`, `NAS_SSH_PRIVATE_KEY`, `NAS_SSH_KNOWN_HOSTS`.
- Produces: `ghcr.io/kim-geon-admin/ghdeploytest-app:${{ github.sha }}` and the SSH request `deploy $GITHUB_SHA`.

- [ ] **Step 1: Resolve current action commit SHAs from GitHub before writing the workflow.**

  Run from Git Bash while authenticated with `gh`:

  ```bash
  for r in actions/checkout actions/setup-node docker/setup-buildx-action docker/login-action docker/build-push-action; do
    t=$(gh api repos/$r/releases/latest --jq .tag_name)
    printf '%s %s %s\n' "$r" "$t" "$(gh api repos/$r/commits/$t --jq .sha)"
  done
  ```

  Use the returned full commit SHAs in `uses:` entries and retain the returned version as the inline comment. Do not use floating tags.

- [ ] **Step 2: Create the workflow with three least-privilege jobs.**

  The workflow must have `push` on `main` and `workflow_dispatch`, top-level `contents: read`, concurrency group `synology-production` with `cancel-in-progress: false`, and these jobs:

  - `test`: Ubuntu runner, Node 22, checkout with `persist-credentials: false`, `npm test`, 15-minute timeout.
  - `build`: needs `test`, only on `refs/heads/main`, `contents: read` and `packages: write`, service matrix `[app]`, Docker Buildx, GHCR login with `${{ github.actor }}` and `${{ secrets.GITHUB_TOKEN }}`, root `Dockerfile`, `linux/amd64`, push enabled, SHA-only tag, OCI source/revision labels, and GitHub Actions build cache.
  - `deploy`: needs `build`, only on `refs/heads/main`, `contents: read` and `packages: read`, write the private key and known hosts with mode `600`, run SSH with `IdentitiesOnly=yes`, `BatchMode=yes`, `StrictHostKeyChecking=yes`, the saved known-hosts file, timeout/keepalive options, and `deploy $GITHUB_SHA`; always remove the private key.

- [ ] **Step 3: Validate workflow references and repository paths.**

  Run from Git Bash:

  ```bash
  rg -n 'ghcr.io/kim-geon-admin/ghdeploytest|Dockerfile|npm test|NAS_SSH_|StrictHostKeyChecking|deploy \$GITHUB_SHA|latest' .github/workflows/deploy.yml
  ```

  Expected result: the first six patterns appear in their intended job sections and `latest` produces no match. Confirm the workflow references `./Dockerfile`, not a generated Dockerfile path.

- [ ] **Step 4: Commit the workflow.**

  ```bash
  git add .github/workflows/deploy.yml
  git diff --cached --check
  git commit -m "ci: deploy immutable images to Synology"
  ```

### Task 4: Document project-specific installation and operations

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the workflow, Compose file, NAS script paths, and confirmed host/port/account values.
- Produces: operator instructions for NAS provisioning, GitHub Secrets, DSM reverse proxy, first push, and rollback logs.

- [ ] **Step 1: Add a concise deployment section without exposing passwords or private keys.**

  Document that the NAS account is `test-deploy`, the SSH endpoint is `nayaguny.synology.me:2233`, the deployment directory is `/volume1/docker/ghdeploytest`, the app binds to `127.0.0.1:3200`, and DSM reverse proxy maps HTTPS to that loopback port. Explain that `infra/synology/.env.example` is a reference and the NAS-owned `.env` must be created with mode `600`.

- [ ] **Step 2: List the five GitHub Secrets exactly.**

  Document `NAS_SSH_HOST`, `NAS_SSH_PORT`, `NAS_SSH_USER`, `NAS_SSH_PRIVATE_KEY`, and `NAS_SSH_KNOWN_HOSTS`; state that `GITHUB_TOKEN` is supplied automatically by Actions and must not be copied to the NAS.

- [ ] **Step 3: Document operational verification and logs.**

  Include the expected container name `ghdeploytest-app-1`, health endpoint `/health`, the NAS log directory `/volume1/docker/ghdeploytest/state/logs/`, and the fact that failed replacement attempts roll back to the previous SHA when available.

- [ ] **Step 4: Commit the operator documentation.**

  ```bash
  git add README.md
  git diff --cached --check
  git commit -m "docs: document Synology deployment"
  ```

### Task 5: Run the complete local verification and prepare NAS/GitHub handoff

**Files:**
- Verify: `package.json`, `Dockerfile`, `.github/workflows/deploy.yml`, `infra/synology/compose.yaml`, `infra/synology/deploy.sh`, `infra/synology/deploy-gate.sh`, `infra/synology/.env.example`, `.gitattributes`, `.gitignore`, `README.md`

**Interfaces:**
- Consumes: all repository changes from Tasks 1–4.
- Produces: fresh verification evidence and a concrete list of remaining DSM/GitHub UI actions.

- [ ] **Step 1: Run the application test suite.**

  ```bash
  npm test
  ```

  Expected result: all existing Node tests pass with exit code `0`.

- [ ] **Step 2: Run script syntax, Compose, and mock-Docker verification again from the final tree.**

  ```bash
  bash -n infra/synology/deploy.sh
  sh -n infra/synology/deploy-gate.sh
  IMAGE_TAG=0123456789abcdef0123456789abcdef01234567 docker compose --env-file infra/synology/.env.example -f infra/synology/compose.yaml config -q
  bash skills-repo/synology-github-actions-docker-deploy/scripts/test-deploy.sh infra/synology/deploy.sh infra/synology/deploy-gate.sh
  ```

  Expected result: every command exits `0`; the mock scenario runner reports all scenarios `PASS`.

- [ ] **Step 3: Build the image locally when Docker Desktop is available.**

  ```bash
  docker build --platform linux/amd64 --build-arg APP_VERSION=0123456789abcdef0123456789abcdef01234567 -t ghdeploytest:verification .
  ```

  Expected result: the image build exits `0`. If Docker is unavailable, report that exact limitation and retain the Compose/script evidence instead of claiming the build passed.

- [ ] **Step 4: Inspect the final diff and ensure no secrets or unrelated files are staged.**

  ```bash
  git status --short
  git diff HEAD~4..HEAD --check
  git diff --name-only HEAD~4..HEAD
  ```

  Expected result: only the design, plan, deployment configuration, scripts, and README changes are listed; `skills-repo/` remains untracked and unstaged.

- [ ] **Step 5: Provide the NAS and GitHub setup handoff with labeled execution locations.**

  The final handoff must guide the user one step at a time through: creating `test-deploy` in DSM, granting `homes` and read-only `docker` access, enabling Home service and Container Manager, installing the root-owned files under `/volume1/docker/ghdeploytest`, creating `/volume1/docker/ghdeploytest/.env` with mode `600`, adding the forced deploy key and one sudoers rule, collecting `ssh-keyscan -p 2233 nayaguny.synology.me`, creating the five GitHub Secrets, configuring DSM reverse proxy to `127.0.0.1:3200`, and watching the first `main` run. Every command block must state `실행 위치 | 실행 방식` and must not contain password, private-key, or angle-bracket placeholders.
