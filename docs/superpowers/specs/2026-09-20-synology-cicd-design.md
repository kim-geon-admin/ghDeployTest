# Synology GitHub Actions CI/CD Design

## Goal

Configure this Node.js application so a successful push to `main` builds an immutable GHCR image and deploys it safely to the Synology NAS through a restricted SSH path with health checks and automatic rollback.

## Confirmed deployment values

- GitHub repository: `kim-geon-admin/ghDeployTest`
- Project and Compose name: `ghdeploytest`
- NAS host: `nayaguny.synology.me`
- NAS SSH port: `2233`
- DSM administrator: `nayaguny`
- Dedicated deployment account: `test-deploy`
- NAS deployment directory: `/volume1/docker/ghdeploytest`
- NAS bind address and port: `127.0.0.1:3200`
- Container port: `3000`
- External HTTPS: DSM reverse proxy to `127.0.0.1:3200`
- Application health endpoint: `/health`
- Persistent data: none; no data volume or backup file is required

## Architecture

GitHub Actions runs `npm test`, builds the existing `Dockerfile` for `linux/amd64`, and pushes `ghcr.io/kim-geon-admin/ghdeploytest-app` with a 40-character lowercase commit SHA tag. A deployment job sends only `deploy <sha>` over SSH using a private key whose `authorized_keys` entry is locked to `deploy-gate.sh`.

The NAS gate accepts only a lowercase 40-character SHA and invokes the one permitted `sudo` target, `deploy.sh`. The root deployment script validates Compose, logs into GHCR using the job-scoped token received on stdin, pulls before stopping the current stack, recreates the app, waits for the Compose health check and a stability window, records the current/previous tags, and rolls back to the previous image if replacement fails.

The app is exposed only on the NAS loopback interface. DSM owns external ports 80/443 and terminates HTTPS through its reverse proxy. The container runs read-only with a `/tmp` tmpfs and no host data volume.

## Repository changes

- `.github/workflows/deploy.yml`: pinned GitHub Actions workflow with separate test, build, and deploy jobs; least-privilege permissions; concurrency; SHA-only image tags; strict SSH host-key checking.
- `infra/synology/compose.yaml`: single `app` service using the GHCR SHA image, loopback binding, read-only execution, and a Node-based `/health` check.
- `infra/synology/deploy.sh`: root-only pull, replace, health-check, rollback, state, log, image-retention, and lock implementation based on the approved skill template.
- `infra/synology/deploy-gate.sh`: forced-command SSH gate for `deploy` plus a 40-character lowercase SHA only.
- `infra/synology/.env.example`: non-secret NAS binding example with `HTTP_BIND=127.0.0.1:3200`.
- `.gitattributes`: LF line endings for shell scripts.
- `.gitignore`: excludes the NAS `.env`, CLI configuration, and local deployment secrets.
- `README.md`: project-specific deployment and post-install verification instructions.

The existing `Dockerfile`, application code, and `npm test` script remain unchanged.

## Security and secrets

The workflow uses these five repository secrets: `NAS_SSH_HOST`, `NAS_SSH_PORT`, `NAS_SSH_USER`, `NAS_SSH_PRIVATE_KEY`, and `NAS_SSH_KNOWN_HOSTS`. The workflow uses the job-scoped `GITHUB_TOKEN` for GHCR and never stores a registry credential on the NAS.

The `test-deploy` account receives no Docker-group access. Its SSH key is registered with `restrict,command="/volume1/docker/ghdeploytest/bin/deploy-gate.sh"`; the dedicated sudoers rule permits only `/volume1/docker/ghdeploytest/bin/deploy.sh`. CI does not write Compose or deployment scripts to the NAS.

## Failure behavior

- Invalid SHA or any SSH command other than the exact deploy form is rejected.
- Invalid Compose configuration, unavailable Docker, insufficient disk space, registry login failure, or image pull failure leaves the running stack untouched.
- A failed replacement stops the new stack and restores the previous SHA when its image is available.
- If no previous image exists, the failed stack is stopped and the log identifies the manual-intervention state.
- Deployment logs remain under `/volume1/docker/ghdeploytest/state/logs/`.

## Verification

Before committing the repository changes, run the existing `npm test`, shell syntax and gate checks, the skill's mock-Docker deployment scenarios against the project scripts, and Compose configuration rendering with the example environment and a real 40-character test SHA. If Docker Desktop is available, build the image locally. After NAS provisioning, verify the restricted SSH key, the deploy gate, container health, and DSM reverse-proxy response.

## Out of scope

- Creating or changing DSM reverse-proxy certificates and rules automatically.
- Storing application data or backing up database files.
- Deploying mutable `latest` tags.
- Granting the deployment account general shell, Docker, or arbitrary sudo access.
- Changing application behavior or dependencies.
