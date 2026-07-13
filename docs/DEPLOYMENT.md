# Deployment

ROBOTAT ships as a single Docker image (one Express process serving the API and
the built client). Two GitHub Actions workflows drive the pipeline:

| Workflow | File | Trigger | What it does |
| --- | --- | --- | --- |
| **CI** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | every push + PR | audit → typecheck → migrate → test → build |
| **CD** | [`.github/workflows/cd.yml`](../.github/workflows/cd.yml) | push to `main`, `v*` tags, manual | build & publish image to GHCR, then (optionally) deploy to a host |

## The image

CD builds the multi-stage [`Dockerfile`](../Dockerfile) and pushes it to the
GitHub Container Registry for this repo:

```
ghcr.io/ao-kh/robotat
```

Tags produced:

- `sha-<full-git-sha>` — every build (the deploy pins the image by **digest**, not tag)
- `latest` — the tip of `main`
- `1.2.3`, `1.2` — when you push a `v1.2.3` tag

Because the repo is private, the package is private too. Pull it with a GitHub
token that has `read:packages`:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
docker pull ghcr.io/ao-kh/robotat:latest
```

## Running it

Migrations live in the image (`dist/migrate.cjs`, a runtime-only drizzle
migrator — no `drizzle-kit`/devDependencies needed) and run as a one-shot
`migrate` service before the app starts. Use
[`docker-compose.prod.yml`](../docker-compose.prod.yml), which **pulls** the
published image instead of building:

```bash
# On the host, next to docker-compose.prod.yml, with a real .env (see below):
export IMAGE=ghcr.io/ao-kh/robotat:latest
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.yml` (build-locally) is still there for local end-to-end runs.

### Required host `.env`

```dotenv
POSTGRES_PASSWORD=<strong-db-password>
SESSION_SECRET=<32+ random chars>   # app refuses to boot in prod without a strong one
# Optional delivery (logs to console until set):
# SMTP_HOST=  SMTP_PORT=  SMTP_USER=  SMTP_PASS=  ASSESSMENT_INBOX=
# WHATSAPP_BUSINESS_NUMBER=  WHATSAPP_TOKEN=  WHATSAPP_PHONE_ID=
```

## Enabling automated deploy

The `deploy` job is **inert by default** — merging CD with no infrastructure
configured is safe. To turn it on:

1. **Prep the host** (once): install Docker + the Compose plugin, create a deploy
   directory, and put the `.env` above in it. Ensure the deploy user can run
   `docker`.
2. **Add a repo variable** (Settings → Secrets and variables → Actions → Variables):
   - `DEPLOY_ENABLED` = `true`
3. **Add repo secrets** (same page → Secrets):
   | Secret | Value |
   | --- | --- |
   | `DEPLOY_HOST` | server IP / hostname |
   | `DEPLOY_USER` | SSH user (in the `docker` group) |
   | `DEPLOY_SSH_KEY` | private key whose public half is in the host's `authorized_keys` |
   | `DEPLOY_PATH` | absolute path to the deploy dir holding `.env` |
   | `DEPLOY_PORT` | SSH port (optional, defaults to 22) |

Once set, every push to `main` will: build & publish the image, `scp` the
compose file to the host, then over SSH `docker login ghcr.io`, `pull` the
digest-pinned image, `up -d`, and prune old images. The `production`
environment gate also lets you require a manual approval before deploys if you
configure one in repo settings.

## Rollback

Deploys are pinned by image digest, so any past image is a valid target. On the
host:

```bash
export IMAGE=ghcr.io/ao-kh/robotat:sha-<previous-git-sha>
docker compose -f docker-compose.prod.yml up -d
```
