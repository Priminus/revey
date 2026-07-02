# Deploy (Fly.io, `sin` region)

## One-time

```bash
fly apps create revey-api --region sin
fly apps create revey-ui --region sin
```

## Secrets (never commit these)

```bash
fly secrets set -a revey-api DATABASE_URL=... CLERK_SECRET_KEY=...
fly secrets set -a revey-ui NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=... CLERK_SECRET_KEY=... NEXT_PUBLIC_API_URL=https://revey-api.fly.dev/api
```

## Deploy

```bash
fly deploy -a revey-api -c api/fly.toml
fly deploy -a revey-ui -c ui/fly.toml \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder \
  --build-arg NEXT_PUBLIC_API_URL=https://revey-api.fly.dev/api
```

Note: `NEXT_PUBLIC_*` values must be passed as `--build-arg`s (not just `fly secrets`), because
Next.js inlines them into the client bundle at `next build` time, which runs before the
container has access to runtime secrets.
