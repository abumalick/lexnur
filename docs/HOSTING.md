# Hosting

Everything public runs on Cloudflare, in the account that owns the `lexnur.com` zone (registered with Cloudflare Registrar, so its nameservers are Cloudflare's already).

| What | Where | Served at |
|---|---|---|
| Website (`website/`) | Worker `lexnur-website` with static assets | https://lexnur.com, https://www.lexnur.com (301 → apex) |
| Dictionary packages + published catalog | R2 bucket `lexnur-packages` | https://dl.lexnur.com (R2 custom domain) |

`wrangler.jsonc` names no account: put `CLOUDFLARE_ACCOUNT_ID` in `website/.env` (git-ignored; wrangler loads it) or the environment. The same file holds `PUBLIC_CONTACT_EMAIL`, the contact address the privacy and support pages show; the build fails without it.

Both hostnames are attached through their products (Worker custom domains, R2 custom domain), which create the DNS records and certificates; there are no hand-made DNS records.

## Website

Astro static site, English at `/`, Arabic (RTL) under `/ar`. Pages: home, `/privacy`, `/support` — the privacy and support URLs given to the app stores are:

- https://lexnur.com/privacy · https://lexnur.com/ar/privacy
- https://lexnur.com/support · https://lexnur.com/ar/support

`website/worker/index.js` runs before the assets so it can redirect `www.lexnur.com` to the apex; everything else is served from `dist/`.

```sh
cd website
mise trust && mise install   # Node version pinned in website/mise.toml
pnpm install
pnpm dev               # local dev server
pnpm run deploy        # astro build && wrangler deploy
```

## Package bucket

Bucket: `lexnur-packages`. Key layout:

```
packages/<id>/<version>.sqlite.zst    one dictionary package; <id> is the catalog id
catalog/v1.json                       the catalog app 1.0.0 reads (format 1, frozen: never overwritten again)
catalog/v2.json                       the catalog app 1.1.0+ reads (format 2, every dictionary)
```

Package keys are immutable: a new build gets a new `<version>`, never an overwrite, so caches and partially downloaded files stay valid. Never delete a package that `catalog/v1.json` lists: app 1.0.0 still downloads them. `catalog/v2.json` is the only key that is overwritten; `catalog/v1.json` is frozen (see `docs/CATALOG.md` § Published catalogs). `pnpm --filter @lexnur/pipeline run publish <id> <version>` uploads the package and v2.json, refuses to run when the live v2.json lists a release that `catalog/releases.json` lacks (a live file that does not exist yet answers 404 and is skipped), and checks first that the live v1.json is still the frozen file and that every package it lists still answers.

`publish` runs these uploads itself. By hand (recovery only; from `website/`, which pins wrangler; `--remote` is required, otherwise wrangler writes to a local simulator):

```sh
pnpm exec wrangler r2 object put lexnur-packages/packages/<id>/<version>.sqlite.zst \
  --file <path>.sqlite.zst --content-type application/zstd --remote
pnpm exec wrangler r2 object put lexnur-packages/catalog/v2.json \
  --file <path>/v2.json --content-type application/json --cache-control "public, max-age=300" --remote
```

`catalog/v2.json` must always answer 200: app 1.1.0 and later fetch only v2, and without it they never see a catalog newer than their bundled snapshot. `publish` uploads it; check it with:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://dl.lexnur.com/catalog/v2.json   # 200
```

Delete an object: `pnpm exec wrangler r2 object delete lexnur-packages/<key> --remote`.

### CORS

The app fetches `catalog/v1.json` and `catalog/v2.json` from its WebView, whose origin is `https://localhost` (Android) or `capacitor://localhost` (iOS). Without CORS headers the browser blocks the response and the catalog refresh fails silently, so installed apps never see new dictionaries. Package downloads go through native code and need no CORS. The rule is `website/r2-cors.json` (GET and HEAD from those origins and `https://lexnur.com`). `publish` fails when the live catalogs do not answer `Origin: https://localhost` with a matching `access-control-allow-origin`.

Apply (from `website/`; it is a bucket setting, so there is no `--remote`):

```sh
pnpm exec wrangler r2 bucket cors set lexnur-packages --file r2-cors.json
```

Check with the curl in the smoke test below. Undo with `pnpm exec wrangler r2 bucket cors delete lexnur-packages`.

## Smoke test

```sh
curl -sI https://lexnur.com/privacy                 # 200
curl -sI https://www.lexnur.com/privacy             # 301 → https://lexnur.com/privacy
curl -s -o /dev/null -w '%{http_code}\n' -r 0-9 https://dl.lexnur.com/catalog/v1.json   # 206 (range requests work)
curl -sD- -o /dev/null -H 'Origin: https://localhost' https://dl.lexnur.com/catalog/v2.json | rg -i access-control-allow-origin   # access-control-allow-origin: https://localhost
```

R2 custom domains answer range requests with `206 Partial Content` and a `Content-Range` header, which the app relies on to resume interrupted package downloads.
