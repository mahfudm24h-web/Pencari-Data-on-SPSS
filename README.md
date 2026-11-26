# SPSS DataScout AI

Describe the data you need; an AI model searches the web for it and returns a dataset ready for SPSS
(Variable View and Data View), with CSV and SPSS syntax (`.sps`) export.

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express (serves the API and the built frontend)
- **Database:** PostgreSQL (accounts, sessions, saved datasets, search log)
- **AI providers:** Google Gemini and Anthropic Claude, chosen per search. Only providers whose API key is
  set on the server appear in the app.

> The data is collected by an AI model and can contain mistakes. The app shows the sources and a warning
> with every dataset; users should check numbers against the sources before using them.

## Run locally

Requires Node.js 22+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env    # set DATABASE_URL and at least one of GEMINI_API_KEY / ANTHROPIC_API_KEY
npm run dev             # http://localhost:3000
```

A throwaway local database:

```bash
docker run -d --name datascout-db -p 5432:5432 \
  -e POSTGRES_USER=datascout -e POSTGRES_PASSWORD=datascout -e POSTGRES_DB=datascout postgres:16-alpine
```

Tables are created automatically on start. The **first account that registers becomes the administrator**
and has no daily search limit.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run lint` | Type check |
| `npm test` | Unit tests (number parsing, dataset validation) |
| `npm run build` | Build the frontend (`dist/`) and server (`dist-server/`) |
| `npm start` | Run the production build |

## Settings

All settings are environment variables; see [.env.example](.env.example).

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | API keys. Set one or both. |
| `GEMINI_MODEL_FAST`, `GEMINI_MODEL_DEEP`, `CLAUDE_MODEL` | Model overrides. |
| `ALLOW_REGISTRATION` | `false` closes sign-up (the first account can always be created). |
| `DAILY_SEARCH_LIMIT`, `DAILY_DEEP_LIMIT` | Per-user limits per 24 hours. |
| `DATABASE_URL` | PostgreSQL connection string (set automatically in Docker). |

## Deploy to a VPS with Docker and Traefik

These steps fit the Hostinger "Ubuntu 24.04 with Docker and Traefik" template. The app joins the existing
Traefik network; Traefik routes the domain to it and issues the HTTPS certificate.

1. **DNS:** add an `A` record for your subdomain (for example `spss`) pointing to the VPS IP address.

2. **Find your Traefik settings** on the server:

   ```bash
   docker network ls
   ```

   ```bash
   docker inspect traefik --format '{{json .Args}}'
   ```

   Note the network Traefik is attached to, the certificate resolver name
   (`--certificatesresolvers.<name>...`) and the HTTPS entrypoint name (`--entrypoints.<name>.address=:443`).

3. **Set up the app folder** (once):

   ```bash
   mkdir -p /opt/datascout && cd /opt/datascout
   ```

   Copy `docker-compose.yml`, `.env.example` and the `deploy/` folder there, then:

   ```bash
   cp .env.example .env && chmod 600 .env && nano .env
   ```

   Fill in `POSTGRES_PASSWORD`, `APP_DOMAIN`, the three `TRAEFIK_*` values and your API keys.

4. **Start it.** Either let GitHub Actions deploy (below), or build on the server from a clone of this
   repository:

   ```bash
   docker compose up -d --build
   ```

5. Open `https://<APP_DOMAIN>` and register. That first account is the administrator. Once your users have
   registered, set `ALLOW_REGISTRATION=false` in `.env` and run `docker compose up -d`.

### Automatic deploys

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on every push to `main`: it type-checks,
tests, builds the image, pushes it to GitHub Container Registry and updates the server over SSH.
Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | Server address, e.g. `srv123456.hstgr.cloud` |
| `VPS_USER` | SSH user that can run Docker (e.g. `root`) |
| `VPS_SSH_KEY` | Private key whose public half is in that user's `~/.ssh/authorized_keys` |

### Backups

`deploy/backup.sh` dumps the database to `backups/` and keeps 7 days. Schedule it with `crontab -e`:

```
15 2 * * * /opt/datascout/deploy/backup.sh >> /var/log/datascout-backup.log 2>&1
```

Restore with:

```bash
gunzip -c backups/<file>.sql.gz | docker compose exec -T db psql -U datascout datascout
```

## Adding another AI provider

Implement the `Provider` interface from [server/providers/types.ts](server/providers/types.ts) in a new
file, add it to the list in [server/providers/index.ts](server/providers/index.ts), and read its key in
[server/config.ts](server/config.ts). The provider must be able to search the web and return the JSON
described in [server/providers/prompt.ts](server/providers/prompt.ts).
