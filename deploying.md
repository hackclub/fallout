# Deploying on Coolify

This guide covers deploying the app to [Coolify](https://coolify.io) as 4 resources: **main** (web), **worker** (Solid Queue), **PostgreSQL**, and **Redis**.

## Prerequisites

- A Coolify instance (self-hosted or cloud)
- Your repository connected to Coolify via GitHub

## 1. Create Services

### PostgreSQL

1. Go to your Coolify project and click **New Resource** > **Database** > **PostgreSQL**
2. Note the internal connection URL (e.g. `postgresql://postgres:password@project-db:5432/app`)

### Redis

1. Click **New Resource** > **Database** > **Redis**
2. Note the internal connection URL (e.g. `redis://default:password@project-redis:6379`)

## 2. Create the Main (Web) Application

1. Click **New Resource** > **Application**
2. Select your GitHub repository and branch
3. Set **Build Pack** to **Dockerfile**
4. Set **Dockerfile Location** to `Dockerfile`
5. Set the **Exposed Port** to `80`
6. Configure the health check to hit `/up` on port `80`

This builds with `Dockerfile` and runs Thruster + Rails server.

## 3. Create the Worker Application

1. Click **New Resource** > **Application**
2. Select the **same** GitHub repository and branch
3. Set **Build Pack** to **Dockerfile**
4. Set **Dockerfile Location** to `Dockerfile.worker`
5. **Do not** expose a port — the worker doesn't serve HTTP
6. **Disable** the health check (the worker is a background process, not a web server)

The worker builds with `Dockerfile.worker` and runs Solid Queue (`bin/jobs`) to process background jobs.

## 3b. Create the Heavy Worker Application (Server B)

The heavy worker handles CPU/IO-intensive jobs (image/video processing) on a separate server with more compute capacity.

1. Add **Server B** as a server in your Coolify instance
2. Click **New Resource** > **Application** on Server B
3. Select the **same** GitHub repository and branch
4. Set **Build Pack** to **Dockerfile**
5. Set **Dockerfile Location** to `Dockerfile.heavy_worker`
6. **Do not** expose a port — the heavy worker doesn't serve HTTP
7. **Disable** the health check (background process, not a web server)

The heavy worker builds with `Dockerfile.heavy_worker` (which includes FFmpeg and ImageMagick) and runs Solid Queue processing only the `heavy` queue.

### Environment Variables

The heavy worker uses the **same** environment variables as the main and worker apps (see step 4), with one key difference:

- `DATABASE_URL` and `REDIS_URL` must point to **Server A's public endpoints** (not internal Docker hostnames) since the heavy worker runs on a different server
- Use SSL for both connections (e.g. `postgresql://user:pass@server-a-ip:5432/fallout_production?sslmode=require`)

### Network Security

- **Firewall** Server A's PostgreSQL (5432) and Redis (6379) ports to allow only Server B's IP
- Use **strong passwords** (32+ characters) for database credentials
- Optionally create a **dedicated PostgreSQL user** for Server B with limited permissions

## 4. Configure Environment Variables

Add the following environment variables to **both** the main and worker applications. Refer to `.env.production.example` for the full list.

**Do not** set `SOLID_QUEUE_IN_PUMA` — the worker container handles job processing separately.

### Required

| Variable           | Description                                |
| ------------------ | ------------------------------------------ |
| `DATABASE_URL`     | PostgreSQL connection URL from step 1      |
| `REDIS_URL`        | Redis connection URL from step 1           |
| `RAILS_MASTER_KEY` | Contents of `config/master.key`            |
| `SECRET_KEY_BASE`  | Run `bin/rails secret` locally to generate |
| `APP_HOST`         | Your app's domain (e.g. `app.example.com`) |

### OAuth & Integrations

| Variable            | Description                      |
| ------------------- | -------------------------------- |
| `HCA_CLIENT_ID`     | HCA OAuth client ID              |
| `HCA_CLIENT_SECRET` | HCA OAuth client secret          |
| `SLACK_BOT_TOKEN`   | Slack bot token for profile sync |

### Storage (Cloudflare R2)

| Variable               | Description              |
| ---------------------- | ------------------------ |
| `R2_ACCESS_KEY_ID`     | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `R2_BUCKET`            | R2 bucket name           |
| `R2_ENDPOINT`          | R2 endpoint URL          |

### Optional

| Variable                  | Description                     |
| ------------------------- | ------------------------------- |
| `GEOCODER_API_KEY`        | Geocoding API key               |
| `SKYLIGHT_AUTHENTICATION` | Skylight performance monitoring |
| `SENTRY_DSN`              | Sentry error monitoring DSN     |
| `LOOPS_API_KEY`           | Loops.so API key for mailer     |
| `MAILER_FROM`             | Default from email address      |
| `EXTERNAL_API_KEY`        | API key for `/api/v1` endpoints |
| `UPTIME_WORKER_PING_URL`  | Uptime monitoring ping URL      |

## 5. Network Configuration

If your PostgreSQL and Redis resources are in the same Coolify project, use internal hostnames in `DATABASE_URL` and `REDIS_URL` so traffic stays on the internal Docker network.

## 6. Domain & SSL

1. In the **main** application's settings, add your custom domain
2. Coolify handles SSL certificates automatically via Let's Encrypt
3. The worker does not need a domain

## 7. Deploy

Deploy the **main** app first (its entrypoint runs `rails db:prepare` to apply migrations), then deploy the **worker**.

Push to your configured branch or click **Deploy** in the Coolify dashboard.

## Troubleshooting

- **Assets not loading**: Ensure `RAILS_MASTER_KEY` is set correctly — asset precompilation happens at build time with a dummy key, but the app needs the real key at runtime for encrypted credentials.
- **Database connection errors**: Verify `DATABASE_URL` uses the correct internal hostname and that the database resource is running.
- **WebSocket / Action Cable issues**: Confirm `REDIS_URL` is set and the Redis resource is healthy.
- **Jobs not processing**: Check the worker container's logs. Ensure it has the same `DATABASE_URL` and `REDIS_URL` as the main app.
