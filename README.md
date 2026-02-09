# Hack Club Rails Starter Templplate (WIP)

This template aims to be a starting point for Hack Club programs written in rails. It is heavily inspired by, with code used from, previous Hack Club programs such as the Summer of Making, HCB, or Submit. This template contains:

- User authentication via Slack OAuth
- WIP

## Local Development Setup

### 1. Prerequisites

- Ruby (see `.ruby-version` or Gemfile)
- Bundler (`gem install bundler`)
- Docker (for running Postgres)

### 2. Start Postgres with Docker

You can spin up a local Postgres instance using Docker:

```sh
docker run -d \
  --name fallout-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=fallout \
  -e POSTGRES_DB=fallout_development \
  -p 5432:5432 \
  postgres:15
```

Update your `.env` file with these credentials:

```
DATABASE_URL=postgres://postgres:fallout@localhost:5432/fallout_development
```

### 3. Install dependencies

```sh
bundle install
```

### 4. Setup the database

```sh
bin/rails db:setup
```

### 5. Start the Rails server

```sh
bin/dev
```

---

See `.env.development.example` for required environment variables.
