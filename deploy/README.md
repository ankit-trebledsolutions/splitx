# Deploying the edge config (Nginx + compose)

How the server is set up, and how to roll out or back the November 2026
hardening of the Nginx config (audit items O-4 and O-5 in
`SECURITY-AUDIT-2026-11-05.md`). First-time VPS setup is `setup-vps.sh`.

## Which mode is live

There are two Nginx configs, and `COMPOSE_FILE` in the server's `./.env` picks
one:

| Mode | When | Nginx config | Cloudflare |
|---|---|---|---|
| Two domains | `COMPOSE_FILE` not set | `deploy/nginx/templates/` | Yes: both names proxied, Cloudflare origin certificate in `deploy/certs` |
| No domain | `COMPOSE_FILE=docker-compose.yml:docker-compose.no-domain.yml` | `deploy/nginx/no-domain/` | No: Let's Encrypt on the Hostinger name |

The app and the README still point at `srv2035255.hstgr.cloud`, which means
**no-domain mode is probably what is live today**. Check with
`grep COMPOSE_FILE .env` on the server. Everything Cloudflare-specific below
applies only when you switch to two domains.

## What changed

Both modes:
- **A catch-all server that drops everything else.** A request for the bare
  IP, or for a name that is not ours, gets its TLS handshake refused
  (`ssl_reject_handshake`) or, on port 80, the connection closed (444).
- **`server_tokens off`.** No Nginx version in headers or error pages.
- **`X-Forwarded-For` is set to the caller's address**, not appended to.
  The API trusts exactly one proxy (`TRUST_PROXY: 1`).
- **Security headers on the admin panel's pages**: Content-Security-Policy,
  X-Frame-Options `DENY`, `nosniff`, Referrer-Policy `same-origin`, HSTS
  (the same value the API's Helmet sends) and Permissions-Policy. `/api`,
  `/uploads`, `/media` and the rest keep the API's own Helmet headers.

Two-domain mode only:
- **Locked to Cloudflare.** `templates/cloudflare.conf.template` lists
  Cloudflare's ranges. Requests from those ranges take the visitor's address
  from `CF-Connecting-IP`. Anything that did not come through Cloudflare is
  dropped (444) before it reaches the API. Before this change, anyone who
  found the VPS IP could connect directly and pick their own address for every
  per-IP limit. UFW cannot stop that, because Docker's published ports go
  around it.
- `TRUST_PROXY` goes from 2 to 1 in `docker-compose.yml`. **This goes with the
  Nginx change, never alone.** With the old Nginx config, 1 would make every
  visitor look like a Cloudflare address, so they would all share the same
  few per-IP counters. Deploy the two together and roll them back together.

## Before deploying (two-domain mode)

In the Cloudflare dashboard:
1. Both DNS records (API and admin) are **proxied** (orange cloud). A record
   that is DNS-only (grey cloud) sends visitors straight to the VPS, and they
   are now dropped.
2. Both records are **A records only, no AAAA**. Docker without IPv6 set up
   passes IPv6 connections through its own proxy. Nginx then sees a Docker
   address (172.x) instead of Cloudflare's, and drops the request.
3. SSL/TLS mode is **Full (strict)**, so Cloudflare checks the origin
   certificate.

Anything that reaches the server without going through Cloudflare stops
working. That includes an uptime monitor pointed at the IP, or a webhook
configured with the IP. Point those at the domain instead.

## Deploy

On the VPS, in the project folder:

```bash
git pull
# Validate first: renders the templates the same way the real container
# does and runs `nginx -t`, without touching the running site.
docker compose run --rm --no-deps web nginx -t
# Apply. The API is recreated only if its settings changed (two-domain mode:
# TRUST_PROXY). The web container must be restarted either way: it renders
# the templates only when it starts.
docker compose up -d
docker compose restart web
```

There is no image rebuild. The admin panel's files did not change. Expect
a few seconds of dropped connections while Nginx restarts, plus up to about
30 seconds more if the API is recreated.

## Check it

From your own computer (put in your names and the VPS IP):

```bash
# Panel headers: expect Content-Security-Policy, X-Frame-Options: DENY,
# X-Content-Type-Options, Referrer-Policy, and no version after "Server: nginx".
curl -sI https://ADMIN_NAME/ | grep -iE 'content-security|x-frame|x-content|referrer|strict-transport|permissions|server'

# The bare IP: expect a TLS error (handshake refused), and an empty reply on port 80.
curl -vk https://VPS_IP/ 2>&1 | tail -3
curl -sv http://VPS_IP/ 2>&1 | tail -2

# Normal use still works: expect {"success":true,"status":"ok"}.
curl -s https://API_NAME/api/v1/health
```

Two-domain mode only. This test goes straight to the VPS, skipping
Cloudflare, with a faked address. Expect `curl: (52) Empty reply from
server`, not a health answer:

```bash
curl -sk --resolve API_NAME:443:VPS_IP -H 'X-Forwarded-For: 1.2.3.4' https://API_NAME/api/v1/health
```

Then:
- `docker compose logs --tail 20 api` shows visitors' own addresses in the
  request lines, not 172.x or Cloudflare addresses.
- Sign in to the panel, open Manage CMS → Email Templates → Edit on any
  template, and open General Settings → Branding. The editor, the preview
  and the fonts should all work. The browser console (F12) should show no
  red `Refused to …` lines.
- The app signs in, and chat and calls connect. Socket.io goes through the
  same server block.

## Roll back

Everything is in these files, so rolling back is going back to the previous
commit of them:

```bash
git log --oneline -3 -- deploy docker-compose.yml   # find the commit before
git checkout <that commit> -- deploy docker-compose.yml docker-compose.no-domain.yml
docker compose up -d
docker compose restart web
```

Quicker fixes that keep the rest of the change:
- **Visitors are dropped after switching to two domains:** comment out the
  three `if ($from_cloudflare = 0) { return 444; }` lines in
  `templates/default.conf.template`, then `docker compose restart web`. Real
  addresses still work. The direct-to-IP hole is open again until it is fixed.
- **The panel misbehaves and the console shows `Refused to …`:** comment out
  the `add_header Content-Security-Policy` line in that mode's template, then
  `docker compose restart web`. Send the console message so the policy can be
  widened rather than dropped.

## Upkeep

**Cloudflare's address list.** It changes rarely. To update it:

```bash
bash deploy/nginx/update-cloudflare-ips.sh   # rewrites cloudflare.conf.template, shows the diff
docker compose restart web
```

The script refuses to write anything unless it gets a plausible list.

**The theme script in `admin/index.html`.** The CSP allows that one inline
script by its hash. If you edit the script, the hash in both templates
(`'sha256-…'` in `script-src`) must be replaced. Otherwise the browser blocks
the script, and dark-mode users see the panel flash light while it loads.
Print the new hash on a checkout with LF line endings, which is what the VPS
builds from:

```bash
node -e "const h=require('fs').readFileSync('admin/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];console.log(\"'sha256-\"+require('crypto').createHash('sha256').update(h).digest('base64')+\"'\")"
```

**New things the panel loads.** The policy allows scripts and API calls only
from the panel's own origin, styles from Google Fonts, fonts from
fonts.gstatic.com, and images from anywhere on https. A feature that needs
something else (a script from a CDN, a call to another host, a map, a video)
needs its directive widened in both templates. Each part is explained in a
comment above the panel's `location /` in `templates/default.conf.template`.

## Stronger options (not set up)

The allow-list proves a request came from Cloudflare, but not that it came
from **your** Cloudflare account. Someone with their own Cloudflare account
could point a name at your IP and pass the list. The visitor address the API
sees still comes from Cloudflare, not from the caller, so this does not
reopen the per-IP limit hole. Two ways to close the gap anyway:

- **Authenticated Origin Pulls.** Cloudflare shows a client certificate to the
  origin, and Nginx refuses any connection without it. Use your own
  certificate for it (SSL/TLS → Origin Server in Cloudflare): with
  Cloudflare's shared one, every Cloudflare account passes. Put the CA that
  signed it in `deploy/certs` and add these two lines to the API and admin
  443 server blocks:
  ```nginx
  ssl_client_certificate /etc/nginx/certs/origin-pull-ca.pem;
  ssl_verify_client on;
  ```
  Turn it on in Cloudflare first, or every request fails.
- **Cloudflare Tunnel.** A `cloudflared` container dials out to Cloudflare,
  and the `ports:` on `web` are removed, so the VPS accepts no web traffic at
  all. This needs a tunnel token. Each public hostname points at
  `https://web:443` with its origin server name set to that same public name.
  Without it, the catch-all server above refuses the handshake. It is the most
  thorough option, and the most work.
