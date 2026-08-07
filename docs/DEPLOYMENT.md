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
# On the host, next to the compose files, with a real .env (see below):
export IMAGE=ghcr.io/ao-kh/robotat:latest
docker compose pull
docker compose up -d
```

`docker compose` is invoked without `-f` because `COMPOSE_FILE` in the host `.env`
selects the files — see the next section. `docker-compose.yml` (build-locally) is
still there for local end-to-end runs.

### HTTPS is mandatory, not optional

In production the app issues **`Secure`-only session cookies**. Served over plain
HTTP the browser silently discards them, so `POST /api/auth/login` returns 200 and
the very next request is 401 — the web app cannot log in at all. (Bearer tokens are
unaffected, so a native client would appear to work while the website is broken.)

[`docker-compose.caddy.yml`](../docker-compose.caddy.yml) is an overlay that puts
Caddy in front of the app and obtains and renews Let's Encrypt certificates
automatically. Enable it by setting `COMPOSE_FILE` in the host `.env`:

```dotenv
COMPOSE_FILE=docker-compose.prod.yml:docker-compose.caddy.yml
DOMAIN=robotat.example.com    # must already resolve to this host
APP_PORT=127.0.0.1:5000       # keep the app off the public interface
```

`APP_PORT` matters: without it the app service still publishes `0.0.0.0:5000`, so
the plaintext origin stays reachable and bypasses TLS. It also makes the hard-coded
`trust proxy` setting correct, since a real proxy is now the only path in.

If you terminate TLS some other way (an existing nginx, a cloud load balancer),
leave `COMPOSE_FILE` at just `docker-compose.prod.yml`, still set
`APP_PORT=127.0.0.1:5000`, and point your terminator at that port.

### Required host `.env`

```dotenv
POSTGRES_PASSWORD=<strong-db-password>
SESSION_SECRET=<32+ random chars>            # openssl rand -base64 32
PUBLIC_APP_URL=https://your-domain.example   # must be https://
COMPOSE_FILE=docker-compose.prod.yml:docker-compose.caddy.yml
DOMAIN=your-domain.example                   # for the Caddy overlay
APP_PORT=127.0.0.1:5000                      # app not publicly exposed
# Optional delivery (logs to console until set):
# SMTP_HOST=  SMTP_PORT=  SMTP_USER=  SMTP_PASS=  ASSESSMENT_INBOX=
# WHATSAPP_BUSINESS_NUMBER=  WHATSAPP_TOKEN=  WHATSAPP_PHONE_ID=
```

Both required variables are enforced twice, and the stack will not start without
them. Compose fails first (`${VAR:?}`), and if the app is started some other way,
`server/lib/env.ts` refuses to boot in production and prints what is wrong.

- **`SESSION_SECRET`** signs session cookies **and** bearer tokens. The guard rejects
  the development secret, anything that looks like a placeholder (`change-me`,
  `example`, `placeholder`, …) and anything shorter than 32 characters. A committed
  placeholder booting as production would let anyone forge a token for any account.
- **`PUBLIC_APP_URL`** is the origin used to build emailed password-reset links.
  Without it those links would be built from the request's `Host` header, which an
  attacker controls — they could have a genuine reset token emailed to a victim
  pointing at their own domain. Outside production it falls back to the request
  origin for local development only.

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
