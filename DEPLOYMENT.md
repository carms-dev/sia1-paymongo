# BUDOL: Supabase PostgreSQL and Render

## Database setup

1. Create a Supabase project and keep its database password private.
2. In the Supabase SQL Editor for the new, empty project, run `database/schema.sql`.
3. Copy a PostgreSQL connection-pooler URL from Supabase's **Connect** panel. Prefer the pooler URL if the hosting environment cannot use Supabase's IPv6 direct endpoint.
4. Download the Supabase CA certificate from **Database Settings → SSL Configuration** into `certs/supabase-prod-ca.crt`.
5. Put the URL in the local `.env` as `DATABASE_URL=...`, set `PGSSL=true`, and set `PGSSL_CA=certs/supabase-prod-ca.crt`. If the password contains URL-reserved characters, URL-encode them in the connection URL.
6. Remove the old `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL` settings from the local `.env`. Do not commit or share `.env`.
7. Run `npm start`; this starts the website and its three internal services. Open `http://localhost:3000/health`.
8. Promote your own newly registered account to admin by running the final `UPDATE users ...` statement in the Supabase SQL Editor with your email address.

The schema script is safe to re-run for creating missing objects and seeding categories. It is not a MySQL-to-PostgreSQL data migration: existing MySQL users, products, and orders are not copied.

## Render deployment

This repository's `npm start` starts the four Node processes under one Render web service. The main Express server uses Render's assigned `PORT`; the other processes use loopback service ports. In Render, configure:

- **Build command:** `npm ci`
- **Start command:** `npm start`
- **Environment:** `NODE_ENV=production`
- **Environment:** `DATABASE_URL` = Supabase connection-pooler URL
- **Environment:** `PGSSL=true`
- **Environment:** `PGSSL_CA` = path to the downloaded Supabase CA certificate, deployed securely with the app
- If Render does not have the certificate as a file, set `PGSSL_CA_BASE64` to its base64-encoded contents instead of `PGSSL_CA`.
- **Environment:** `PG_POOL_MAX=3`
- **Environment:** `INTERNAL_API_KEY` = a long random secret shared by the four processes
- **Environment:** `APP_URL` = the public Render URL, e.g. `https://your-service.onrender.com`
- **Environment:** `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, and `PAYMONGO_PAYMENT_METHODS` using PayMongo test credentials during testing

The child service URLs default to localhost and are set by `start-all.js`. Do not use the local ngrok startup in production. Configure the PayMongo webhook to the public main-server route:

`https://your-service.onrender.com/api/webhooks/paymongo`

Add a custom domain and live PayMongo keys only after test-mode checkout and webhook delivery work. Never put database or payment secrets in frontend files.

## Free-plan limitations

Supabase currently offers a free tier, but free projects have storage/egress limits and may pause after inactivity. Render currently offers free web-service instances, but they spin down when idle, have monthly usage limits, and are intended for testing/hobby projects. Render's free Postgres database expires after 30 days, so this configuration uses Supabase for the database instead. Therefore, a small demo may be possible at $0 within the current quotas, but it is not guaranteed to stay free or provide production-grade uptime. Check both providers' current pricing and usage pages before deployment:

- [Supabase pricing](https://supabase.com/pricing)
- [Render free instance limitations](https://render.com/docs/free)

## Local MySQL data

XAMPP MySQL is no longer used by the PostgreSQL app. If the MySQL database contains data you need, export and migrate that data separately before switching; running the PostgreSQL schema does not convert it. Keep the old database untouched until you have verified the migrated records.
