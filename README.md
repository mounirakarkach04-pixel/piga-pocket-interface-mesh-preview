# PIGA Pocket Showroom Edge

The existing Cloudflare Worker remains attached to `pigapocket.com` and acts as the governed edge for the public PIGA Pocket Showroom.

## Contract

- proxies public showroom requests to the hosted PIGA Pocket site
- keeps the previous static interface mesh as a GET/HEAD fallback
- preserves the existing Worker, custom domain, and static assets
- `/healthz` returns a machine-readable deployment receipt
- non-idempotent requests fail closed if the upstream is unavailable
- strips client-IP forwarding headers before proxying
- adds PIGA security and authority headers to every response
- contains no secrets and grants no external execution authority
- A7SEM Reverse remains a continuous meta-operator, not a sixth engine

## Local validation

```sh
npm install
npm run check
npm run dev
```

## Deploy

```sh
npm install
npm run deploy
```
