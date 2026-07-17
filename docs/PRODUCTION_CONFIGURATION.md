# Production Configuration and Deployment

beFitBeStrong uses fail-fast environment validation, deployable container examples,
release metadata, and separate liveness/readiness checks. The examples contain
placeholders only. Real secrets belong in the deployment platform secret store or
an ignored `deploy/.env.production` file.

## Environment policy

| Setting | Local | Staging | Production |
|---|---|---|---|
| `NODE_ENV` | `development` or `test` | `production` | `production` |
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | `local` | `staging` | `production` |
| Public URLs | HTTP localhost allowed | non-local HTTPS required | non-local HTTPS required |
| Firebase | optional, but each SDK group is all-or-none | both client and Admin groups required | both groups required |
| Razorpay | optional | complete group; test key allowed | complete group; `rzp_live_` key required |
| Email | optional unless explicitly required | same | same |
| Courier | manual fallback | manual or complete Shiprocket group | manual or complete Shiprocket group |
| Log level | debug allowed | `info` or stricter | `info` or stricter |

Backend validation runs before the server opens its port. Frontend validation runs
when `next.config.ts` loads, so an invalid deployment fails before compilation.
Error messages list variable names only and never print credential values.

## Prepare configuration

1. Copy `deploy/.env.production.example` to `deploy/.env.production`.
2. Replace every placeholder and keep the new file out of version control. Use URL-safe random database and Redis passwords because the example embeds them in connection URLs.
3. Use exact origins without trailing slashes:
   - `PUBLIC_SITE_URL=https://shop.example.com`
   - `PUBLIC_API_URL=https://api.example.com`
4. Set `RELEASE_SHA` to the deployed Git commit SHA.
5. Set `TRUST_PROXY_HOPS` to the number of trusted reverse proxies in front of
   Express. The production example assumes one TLS reverse proxy.

Firebase's downloaded service-account JSON is not pasted wholesale into an env
variable. Copy only `project_id`, `client_email`, and `private_key` into the three
backend variables. Keep the private key's literal `\n` escapes. The six Web SDK
values are public identifiers and are compiled into the frontend bundle.

Before launch, add the storefront hostname in Firebase Authentication's authorized
domains. Enable Email/Password sign-in and verify that the production project—not
the local/test project—is selected.

Razorpay production requires a live key and a webhook at:

```text
https://api.example.com/webhooks/razorpay
```

Use a separate webhook secret. Do not reuse the API key secret. The endpoint must
receive the raw request body; the application already mounts it before JSON parsing.

Keep outbound Razorpay calls bounded. The production template defaults each
attempt to 5 seconds, permits at most 3 attempts, and starts exponential jitter
at 250 ms:

```text
RAZORPAY_HTTP_TIMEOUT_MS=5000
RAZORPAY_HTTP_MAX_ATTEMPTS=3
RAZORPAY_HTTP_RETRY_BASE_MS=250
```

Do not raise these values without checking the reverse-proxy/client request
deadline and total worst-case budget. Retry safety and recovery behavior are in
[`PROVIDER_HTTP_RELIABILITY.md`](./PROVIDER_HTTP_RELIABILITY.md).

If email delivery is a launch requirement, set both `RESEND_API_KEY` and
`EMAIL_FROM`, then set `EMAIL_DELIVERY_REQUIRED=true`. Set
`ADMIN_NOTIFICATION_EMAIL` to the operations inbox that should receive secondary
new-order alerts. Tune `EMAIL_HTTP_TIMEOUT_MS`, `EMAIL_OUTBOX_SCAN_SECONDS`,
`EMAIL_OUTBOX_BATCH_SIZE`, and `EMAIL_OUTBOX_MAX_ATTEMPTS` only with an explicit
queue-age and provider-rate budget. Otherwise leave the provider values empty: the
readiness check reports email as optional/unavailable, messages remain durably
`PENDING`, and persistent dashboard alerts still work. Operators can inspect and
retry delivery at `/admin/email-delivery`; see
[`EMAIL_OUTBOX.md`](./EMAIL_OUTBOX.md).

Automated courier booking is opt-in. Keep `COURIER_PROVIDER=manual` until a
dedicated Shiprocket API user, exact pickup-location name, pickup PIN, and webhook
token are ready. Then set the complete Shiprocket variable group and configure:

```text
https://api.example.com/webhooks/fulfillment
```

Use the configured webhook token as Shiprocket's `x-api-key`. The generic path is
intentional because Shiprocket rejects callback URLs containing its brand
abbreviations. Manual fulfillment remains available if the integration is disabled.

## Validate before deployment

From the backend directory, validate the current environment without showing
secrets:

```bash
pnpm config:check
pnpm typecheck
pnpm test
pnpm build
```

Validate the production Compose interpolation:

```bash
docker compose \
  --env-file deploy/.env.production \
  -f deploy/docker-compose.production.example.yml \
  config --quiet
```

The frontend Docker build sets `NEXT_PUBLIC_APP_ENV=production`. Missing Firebase
values, localhost URLs, malformed URLs, or HTTP deployment URLs stop the build.

## Deploy

The example binds frontend/backend ports to loopback so a host reverse proxy can
terminate TLS without exposing raw application ports publicly.

Create immutable images with the `Release images` GitHub workflow and deploy the
full released commit SHA with the protected `Deploy production` workflow. The server
runs `deploy/scripts/deploy-release.sh`, pulls images from GHCR, applies migrations
once, starts services without building, and verifies health. Follow the
[CI/CD guide](./CI_CD_GUIDE.md) for initial configuration and rollback.

`migrate` is a one-shot release service that invokes the image-bundled Prisma CLI
directly. The deployment script waits for it to succeed before starting the backend.
Migrations do not run once per API replica.

Point the reverse proxy at:

- storefront: `127.0.0.1:3005`
- API: `127.0.0.1:4000`

Forward the original client/proxy headers and keep `TRUST_PROXY_HOPS` aligned with
the real topology so rate limiting does not trust arbitrary forwarded addresses.

## Health and rollback checks

- `GET /health` or `GET /health/live`: process liveness; no dependency calls.
- `GET /health/ready`: database, Redis, and safe configuration/capability status.
- Frontend `GET /health`: web process, app environment, release, and Firebase
  capability flag.

A deploy is ready only when both public health endpoints return HTTP 200 and the
reported release matches `RELEASE_SHA`. Health responses contain booleans and names,
never secrets.

Before applying migrations, take a database backup and confirm the restore
procedure. Roll back application images by release SHA. Do not blindly roll back a
schema after a forward migration; use a reviewed compensating migration when data
shape changed.

## Secret handling

- Never commit `.env.production`, `.env.staging`, PEM files, or service-account JSON.
- Prefer the hosting provider's secret store over files on disk.
- Rotate Firebase, Razorpay, database, Redis, and Resend credentials independently.
- Rebuild the frontend after changing any `NEXT_PUBLIC_*` value; those values are
  build-time configuration.
- Restart backend containers after rotating server-only variables.
