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
fly deploy -a revey-ui -c ui/fly.toml
```
