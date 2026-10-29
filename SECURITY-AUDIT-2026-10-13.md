# Splix — Security Assessment Report

**Application:** Splix (expense-splitting & group trip-planning platform)
**Components reviewed:** `backend/` (Node/Express/MongoDB API), `admin/` (React/Vite admin panel), `mobile/` (React Native / Expo app), `deploy/` (Docker + Nginx + VPS)
**Assessment type:** White-box static code review (source-level), read-only
**Date:** 2026-10-13
**Reviewer:** Senior Security Analyst (Claude Code)
**Commit / branch:** `development` @ `ac2f129`

> **Testing constraint honoured:** No dynamic testing was run against the live
> MongoDB Atlas cluster, Cloudflare R2, Resend, OpenAI or Stream. `backend/.env`
> on this machine targets **production** data and real provider keys, so every
> finding below is derived from reading the code, config and `npm audit`, not
> from live exploitation. Each exploit scenario is described but not executed.

---

## 1. Executive summary

Splix is, overall, **built to a high security standard.** The team has clearly
thought about authentication, access control, secret handling and input
validation, and in most places implemented them correctly and with good inline
rationale. There is **no anonymous/unauthenticated critical vulnerability** —
no RCE, no SQL/NoSQL injection, no auth bypass, no secret leaked in the git
history, no mass-assignment sink.

The issues that remain are mostly **privilege-boundary, hardening and
dependency** items. The single most important one is a **privilege-escalation
path inside the admin panel** (Finding H-1): a co-admin can grant themselves
permissions that are supposed to be super-admin-only, and can take over other
admin or app-user accounts by resetting their password. Exploiting it requires
an existing co-admin account, which is why it is rated High rather than
Critical, but it fully defeats the panel's documented permission model.

### Findings by severity

| # | Severity | Finding | Area |
|---|----------|---------|------|
| H-1 | **High** | Co-admin privilege escalation & account takeover via `PATCH /admin/users/:id` | Backend / AuthZ |
| M-1 | Medium | Vulnerable dependencies (1 critical, many high) incl. runtime packages | All |
| M-2 | Medium | X-Forwarded-For spoofing → per-IP rate-limit bypass (origin not locked to Cloudflare) | Backend / Infra |
| M-3 | Medium | Mobile: session JWT + PII stored in plaintext `AsyncStorage` (no SecureStore) | Mobile |
| M-4 | Medium | Admin panel served with no security headers (HSTS / CSP / X-Frame-Options) | Infra |
| M-5 | Medium | Mobile: `usesCleartextTraffic=true` in the production APK | Mobile |
| L-1 | Low | Task update does not re-validate assignees → cross-group name/email disclosure | Backend / AuthZ |
| L-2 | Low | Any group member can disable/edit another member's group reminder | Backend / AuthZ |
| L-3 | Low | Chat upload accepts any file type; stored and served `inline` with caller's MIME | Backend |
| L-4 | Low | Socket.io handshake does not re-check `isActive` (suspended user keeps realtime) | Backend |
| L-5 | Low | Mobile: `allowBackup=true` can exfiltrate the plaintext token via backup | Mobile |
| L-6 | Low | No per-account lockout on mobile login (per-IP brake only) | Backend |
| L-7 | Low | Dead admin API slices omit the CSRF header / use a localhost base URL | Admin (latent) |
| L-8 | Low | Debug `console.log` of co-admin / error objects in admin panel | Admin |
| I-x | Info | Operational & defence-in-depth notes (live `.env`, committed client config, stale config) | — |

---

## 2. Scope & methodology

- **Backend** — every route (`src/routes/*`), controller, service, middleware,
  model, the crypto vault, storage providers, realtime socket layer, email
  rendering and the AI itinerary path were read. Searched for injection sinks
  (`eval`, `child_process`, `$where`/`$function`, raw `find(req.body)`,
  mass-assignment), authorization gaps (IDOR), and secret handling.
- **Admin panel** — auth/session model, CSRF, XSS sinks
  (`dangerouslySetInnerHTML`, TinyMCE, email preview), secret exposure in the
  bundle, route gating, dependency/config.
- **Mobile** — token storage, network/TLS config, secrets in the bundle, Google
  sign-in, deep links, the native `splix-alarm` Kotlin module (exported
  components, PendingIntent flags), WebView, logging, randomness.
- **Infra** — `docker-compose*.yml`, Nginx templates, `setup-vps.sh`,
  Dockerfiles.
- **Supply chain** — `npm audit` on all three packages; full git history scanned
  for committed secrets.

---

## 3. Detailed findings

### H-1 — High — Co-admin privilege escalation & account takeover via `PATCH /admin/users/:id`

**Location:**
[backend/src/routes/admin.routes.js:186](backend/src/routes/admin.routes.js#L186) (route guard), [:69](backend/src/routes/admin.routes.js#L69) (schema), [backend/src/services/admin.service.js:188](backend/src/services/admin.service.js#L188) (`updateUser`)

**What it is.** The dedicated route for changing an admin's module permissions
is correctly locked to a super admin:

```js
router.put('/users/:id/permissions', adminWriteLimiter, requireSuperAdmin, …)   // line 194
```

But the general update route is guarded only at co-admin level, and its schema
accepts `permissions`, `password` and `email`:

```js
router.patch('/users/:id', adminWriteLimiter, canWriteUsers, validate(updateUserSchema), controller.updateUser)  // line 186
// updateUserSchema (line 69) → { name?, email?, password?, role?, permissions? }
```

In the service, the `permissions`, `password` and `email` branches have **no
super-admin check and no self-check** (`assertNotSelf`/`assertNotLastSuperAdmin`
are applied only to the `role` branch):

```js
// admin.service.js:223
if (data.permissions !== undefined) {
  const effectiveRole = data.role || user.role;
  if (effectiveRole !== ROLES.ADMIN) throw ApiError.badRequest('Only admin accounts carry module permissions');
  user.permissions = cleanPermissions(data.permissions);   // ← no actor.role === SUPER_ADMIN, no assertNotSelf
}
…
if (data.password) user.password = data.password;           // ← line 221, any visible target
```

Role promotion to staff *is* correctly blocked for non-super-admins (lines
193–201), so this is **not** a path to `super_admin`. But it defeats the
super-admin-only *permission model* and the staff account boundary.

**Impact / exploit.**
- *Self-escalation:* a co-admin whose only grant is `user_management:read_write`
  sends
  `PATCH /api/v1/admin/users/<ownId>` with header `X-Admin-Request: 1` and body
  `{"permissions":{"user_management":"read_write","email_template":"read_write","general_settings":"read_write"}}`.
  `canWriteUsers` passes, `effectiveRole` is their own `admin`, and the map is
  saved. On their next request `adminProtect` re-reads permissions from the DB —
  they now hold `email_template` (rewrite the verification / password-reset
  emails sent to **every** user) and `general_settings`. This is exactly what
  `PUT /users/:id/permissions` is designed to forbid them.
- *Peer-admin / app-user takeover:* the same route against another non-owner
  account —
  `PATCH /api/v1/admin/users/<otherId>` body `{"password":"NewPass123!"}` (the
  target's email is visible from `GET /admin/users`). `assertVisible` hides only
  `super_admin` targets, so any co-admin or app user is editable. The attacker
  then signs in as that account and inherits its access. No notification is sent.

**Why High, not Critical.** Requires an authenticated co-admin account
(already-trusted staff). It cannot reach `super_admin` and cannot touch the
owner-only Third-Party-API keys. But within the staff tier it is a complete
break of the permission model.

**Remediation.** Make `updateUser` match the dedicated route: gate the
`permissions` branch (and the `password`/`email` of *other staff*) behind
`requireSuperAdmin`, or remove `permissions` from `updateUserSchema` entirely so
that permission changes only ever flow through the super-admin-only
`PUT /users/:id/permissions`. Add `assertNotSelf` to the permission branch.

---

### M-1 — Medium — Vulnerable dependencies (1 critical, numerous high)

**Location:** `backend/package.json`, `admin/package.json`, `mobile/package.json` (`npm audit`, 2026-10-13)

| Package tree | Totals | Notable runtime-reachable |
|---|---|---|
| backend | 11 (1 critical, 6 high, 4 moderate) | **`proxy-addr` (critical)** IP-spoof via IPv4-mapped IPv6 trust subnet (feeds M-2); **`multer` (high)** DoS via crafted multipart field names; **`sharp`/libvips (high)** image-parse CVEs — reachable via uploads; `body-parser`/`express`/`qs` (moderate) |
| admin | 26 (21 high) | **`tinymce` (high)** XSS (mitigated in-panel by the sandboxed preview — see §4); build-time: `vite`, `lodash`, `react-router`, `rollup`, `postcss` |
| mobile | 57 (1 critical, 36 high) | **`axios` (high)** prototype-pollution gadget in the fetch adapter — runtime; most others are Expo/Metro/Jest build tooling |

Many high counts are **build/dev-only** (nodemon, vite, jest, metro, expo-cli)
and do not ship to production. Priority is the runtime-reachable ones:
`proxy-addr`, `multer`, `sharp`, `axios`, and the `express`/`body-parser`/`qs`
chain.

**Remediation.** `npm audit fix` where non-breaking; bump `express`
(pulls fixed `body-parser`/`qs`/`proxy-addr`), `multer`, `sharp`, and `axios`
(mobile) deliberately and re-test uploads and calling. Re-run `npm audit`
in CI so new advisories surface.

---

### M-2 — Medium — X-Forwarded-For spoofing → per-IP rate-limit bypass

**Location:** [backend/src/app.js:17](backend/src/app.js#L17), [:47](backend/src/app.js#L47); [backend/src/config/env.js:114](backend/src/config/env.js#L114); `deploy/nginx/templates/default.conf.template`

The API trusts proxy hops (`TRUST_PROXY=2` in `docker-compose.yml`: Cloudflare +
Nginx) so that `req.ip` drives the per-IP sign-in limiter
(`/api/v1/auth`, 50 / 15 min). The Nginx config, however, **does not restrict
inbound connections to Cloudflare's IP ranges** and the VPS origin
(`srvXXXX.hstgr.cloud` / its IP) is reachable directly. An attacker who connects
to the origin, bypassing Cloudflare, fully controls the `X-Forwarded-For`
header; Nginx appends the real socket IP and, with two trusted hops, Express
reads the attacker-supplied value as the client IP. This is compounded by the
`proxy-addr` critical advisory in M-1.

**Impact.** Bypass of the per-IP `/auth` limiter (password / OTP brute force at
scale — see also L-6), and poisoned client IPs in logs (`morgan` combined).

**Remediation.** Lock the origin to Cloudflare: firewall 80/443 to
[Cloudflare IP ranges](https://www.cloudflare.com/ips/) (or use
`cloudflared`/Tunnel), and/or set Nginx `set_real_ip_from` to the Cloudflare
ranges with `real_ip_header CF-Connecting-IP` and trust exactly one hop. Patch
`proxy-addr` via the Express bump.

---

### M-3 — Medium — Mobile session JWT + PII in plaintext AsyncStorage

**Location:** [mobile/src/api/client.js:38](mobile/src/api/client.js#L38), [:45](mobile/src/api/client.js#L45); `mobile/src/context/AuthContext.js` (`multiSet([[TOKEN_KEY,…],[USER_KEY,…]])`)

The bearer JWT (`splity.token`) and the full user object (name/email) are stored
in `AsyncStorage`, which on Android is an **unencrypted** SQLite DB
(`/data/data/com.splity.app/databases/RKStorage`). `expo-secure-store` /
`SecureStore` is used nowhere in the app. The token is long-lived (re-used by
the offline-session-restore design).

**Impact.** On a rooted device, with physical/ADB access, or via device backup
(L-5), the session token is recoverable in cleartext → full account takeover.
Not remotely exploitable (the app sandbox protects it on a stock device), but
the primary credential has no at-rest protection.

**Remediation.** Store the token (and ideally the user blob) in
`expo-secure-store` (Android Keystore / iOS Keychain).

---

### M-4 — Medium — Admin panel served with no security headers

**Location:** `deploy/nginx/templates/default.conf.template`, `deploy/nginx/no-domain/default.conf.template`

The admin SPA is authenticated with an httpOnly cookie but Nginx serves its HTML
with **no** `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` or
`Referrer-Policy`. (The API *does* get Helmet's headers because those responses
pass through Express — but the static panel is served directly by Nginx, so
Helmet never touches it.)

**Impact.** Clickjacking of admin actions (no `X-Frame-Options`); no HSTS means
an initial `http://` request is downgradeable; no CSP means a single injected
script (e.g. the latent sinks in L-7/§4) would run unconstrained.

**Remediation.** Add an `add_header` block in both Nginx server blocks:
`Strict-Transport-Security "max-age=63072000; includeSubDomains"`,
`X-Frame-Options "DENY"` (or a CSP `frame-ancestors 'none'`),
`X-Content-Type-Options "nosniff"`, `Referrer-Policy "no-referrer"`, and a CSP
suited to the panel's bundle.

---

### M-5 — Medium — Mobile: cleartext traffic enabled in the production APK

**Location:** [mobile/app.json:37](mobile/app.json#L37) (`usesCleartextTraffic: true`), shipping in the merged release manifest

The production base URL is HTTPS and the only `http://` URL in the source is
`__DEV__`-gated ([client.js:34](mobile/src/api/client.js#L34)), so normal
traffic is encrypted. But the global cleartext flag ships in the release APK with
no `networkSecurityConfig`, so any accidental or future cleartext request (an
`http://` image/`/uploads` URL from the server, a redirect, a new endpoint) is
transmittable and MITM-injectable with no downgrade protection. The flag is only
actually needed for the dev Metro/emulator host.

**Remediation.** Set `usesCleartextTraffic` false for production; restrict
cleartext to debug builds via a `network_security_config.xml` / build variant.

---

### L-1 — Low — Task update does not re-validate assignees (cross-group PII disclosure)

**Location:** [backend/src/services/task.service.js:81](backend/src/services/task.service.js#L81) (vs. `createTask` at [:27](backend/src/services/task.service.js#L27))

`createTask` rejects assignees who are not group members; `updateTask` assigns
the array verbatim with no such check, then returns the task populated with
`name email`:

```js
const fields = ['title','notes','priority','assignees','dueAt','subtasks','links'];
for (const field of fields) if (payload[field] !== undefined) task[field] = payload[field];
```

**Impact.** Any group member sends `PATCH /api/v1/tasks/<id>` with
`{"assignees":["<victimUserId>"]}` for a user outside the group; the response's
`assignees` leaks that user's name and email across the group boundary (also
pollutes the task with non-member references). Bounded by needing a valid 24-hex
user ObjectId.

**Remediation.** Apply the same `memberIds.has(assignee)` validation used in
`createTask` before saving in `updateTask`.

---

### L-2 — Low — Any group member can disable/edit another member's group reminder

**Location:** [backend/src/services/reminder.service.js:200](backend/src/services/reminder.service.js#L200)

`updateReminder` only checks group membership; `title`, `remindAt`,
`repeatWeekly` and `enabled` can be changed by any member (only `scope` change
and deletion are creator-restricted). Per `models/Reminder.js`, `enabled:false`
is "off for everybody."

**Impact.** Member B can `PATCH /api/v1/reminders/<id>` with `{"enabled":false}`
on member A's group reminder, disabling it for the whole group. Stays within the
group boundary and matches the any-member-editable pattern of tasks/stays, so it
is likely intentional — flagged for a **product decision**, not a tenant break.

**Remediation (if undesired).** Restrict `enabled`/`remindAt`/`title` edits of a
group reminder to its creator or the group admin, as deletion already is.

---

### L-3 — Low — Chat upload accepts any file type; served `inline` with caller MIME

**Location:** [backend/src/middleware/upload.js:30](backend/src/middleware/upload.js#L30) (`chatUpload` has no `fileFilter`), [backend/src/storage/r2.storage.js:105](backend/src/storage/r2.storage.js#L105) (`ContentDisposition: inline`, `ContentType` from the file)

Chat attachments accept any MIME, and R2 stores them with the caller's
`Content-Type` and `inline` disposition. A user could upload an HTML/SVG file; a
victim opening the handed-out signed link in a browser would have it rendered.
The served origin is the isolated R2 storage domain (cross-origin to the API and
admin panel, and the mobile app uses native image/audio/file handlers, not a
web view), so it cannot steal the app JWT or admin cookie. The local
`/uploads` fallback (dev only) is same-origin and higher risk, but R2 is used in
production.

**Remediation.** For chat files, serve attachments with
`Content-Disposition: attachment` (or a benign `Content-Type` such as
`application/octet-stream` for non-image/audio types), and consider an allowlist
of chat MIME types.

---

### L-4 — Low — Socket.io handshake does not re-check `isActive`

**Location:** [backend/src/realtime/socket.js:60](backend/src/realtime/socket.js#L60)

The HTTP `protect` middleware blocks suspended accounts
(`isActive === false`), but the socket `authenticate` only verifies the JWT and
loads `name`. A just-suspended user with a still-valid token keeps their live
socket — presence, typing, and inbound group messages — until the token expires.

**Remediation.** Load `isActive` in the handshake query and reject suspended
users (and optionally disconnect their open sockets when an admin suspends them).

---

### L-5 — Low — Mobile `allowBackup=true` amplifies M-3

**Location:** `mobile/android/app/src/main/AndroidManifest.xml` (RN/Expo default)

With M-3, Android Auto Backup / `adb backup` can copy the AsyncStorage DB —
token included — off the device.

**Remediation.** `allowBackup=false` (via expo-build-properties) or backup rules
that exclude the AsyncStorage DB.

---

### L-6 — Low — No per-account lockout on mobile login

**Location:** [backend/src/app.js:47](backend/src/app.js#L47)

Mobile sign-in is protected only by the per-IP `/auth` limiter (50 / 15 min).
There is no per-account attempt counter (the admin panel, by contrast, keys its
login limiter on the email — `middleware/adminRateLimit.js`). Combined with M-2
(IP spoofing), online password guessing against a known email is feasible.
(OTP codes are separately well-protected: hashed, 5-attempt cap, hourly send
cap.)

**Remediation.** Add a per-email attempt counter / exponential backoff on
`/auth/login`, mirroring `adminLoginLimiter`.

---

### L-7 — Low (latent) — Dead admin API slices omit the CSRF header / use a localhost base

**Location:** `admin/src/features/category/categoryApi.js`, `.../general/generalSettingApi.js`, `.../image-carousel/imageCarouselApi.js`

These build their own `fetchBaseQuery` (base `VITE_BASE_URL || http://localhost:3000`,
`credentials:'include'`) instead of the hardened `adminBaseQuery` in
`admin/src/lib/api.js`, so they omit the `X-Admin-Request` CSRF header. They are
**currently dead** (not mounted in `store.js`, not routed), so not exploitable
today — but a hazard if re-enabled as-is.

**Remediation.** Delete the dead slices, or rebuild them on `adminBaseQuery`.

---

### L-8 — Low — Debug logging in the admin panel

**Location:** `admin/src/components/auth/loginForm.jsx:78`, `admin/src/features/co-admins/coAdminsSlice.js:43,47`

`console.log` of the RTK error object and of co-admin objects (name/email/role/
permissions) when the permissions dialog opens. No tokens/passwords logged;
impact limited to the admin's own devtools. Remove before release.

---

### Informational / operational

- **Live `.env` on the dev machine.** `backend/.env` points `MONGODB_URI` at the
  shared **Atlas** cluster with `NODE_ENV=development`, and holds real R2 /
  Resend / OpenAI / Stream keys. Plain `npm run dev` therefore aims
  account-deleting admin tooling at production. The team's `npm run dev:local`
  and `testkit/safeEnv.js` mitigate this well — use them exclusively for local
  work, and keep production secrets only on the VPS / a secret manager.
- **`SETTINGS_ENCRYPTION_KEY` unset locally** (expected). It **must** be set
  (32+ random chars) on the production host or the panel cannot save API keys;
  changing it later makes stored keys unreadable.
- **`mobile/google-services.json` is committed** — this is a client Android
  Firebase API key that ships in every APK, so it is not a secret leak, but
  apply API-key restrictions (package name + SHA-1) and FCM sender limits in the
  Google Cloud console.
- **`admin/.env` still references the old Render host** (`VITE_API_URL=…onrender.com`).
  Confirm the shipped panel points at the current VPS/domain.
- **Git history is clean** of server secrets: `backend/.env`, the Firebase
  **admin** SDK JSON and the signing material were never committed (verified
  across all 79 commits on every branch).

---

## 4. Security controls verified as sound

These were actively checked and found correct — recorded so they are not
re-litigated:

- **Secrets vault** (`integrations/vault.js`): AES-256-GCM, scrypt-derived key,
  per-slot AAD binding (a key cannot be moved between services), random IV,
  versioned. Secrets are **never returned** to the panel (only a last-4 hint);
  changes require the admin's password re-entered and a successful provider test
  first; all changes are audit-logged.
- **Passwords**: bcrypt cost 12; `select:false`; stripped in `User.toJSON`.
  **OTP**: SHA-256-hashed, 6-digit, 10-min TTL, 5-attempt cap, 60s resend
  cooldown, 5/hour cap; reset exchanged for a single-use 15-min purpose-bound
  JWT.
- **Admin API**: separate `scope:'admin'` token (mobile tokens can't be
  replayed), role + permission re-read from DB every request (instant
  revocation), CSRF via a custom header the CORS allowlist gates, httpOnly
  `sameSite=lax` path-scoped cookie, tiered rate limiters (login keyed per
  email, sensitive actions count only wrong passwords).
- **Injection**: no `eval`/`new Function`, no `child_process`, no `$where`/
  `$function`/`mapReduce`, no `find(req.body)`; zod `.object()` schemas strip
  unknown keys (no mass assignment); all aggregation pipelines are scoped to the
  caller's own group memberships.
- **IDOR**: per-resource endpoints (`/expenses/:id`, `/tasks/:id`, `/photos/:id`,
  `/stays/:id`, `/attractions/:id`, `/itinerary-days/:id`,
  `/conversations/:id`, `/notifications/:id`) load the resource then verify group
  membership / ownership; `settleExpense`, deletes, `removeMember`,
  `deleteGroup`, and AI itinerary are correctly gated (admin/creator/payer
  checks). `/media/*` is an intentional 96-bit capability URL.
- **Email templates**: admin-authored HTML is `<script>`/handler/`javascript:`/
  `data:`-filtered at save, user values are HTML-escaped, and the in-panel
  preview renders inside an empty-`sandbox` iframe (scripts disabled even for a
  compromised admin).
- **Realtime**: JWT-authenticated handshake, rooms gated by DB membership.
- **Mobile**: receives only the **public** Stream key + a server-minted user
  token (never `STREAM_API_SECRET`); native `splix-alarm` module has all
  components `exported=false`, all PendingIntents `FLAG_IMMUTABLE`, private
  SharedPreferences; no WebView; no secrets in the bundle; no tokens/OTPs
  logged.
- **Infra**: UFW limits to SSH/80/443; API container runs as non-root; Atlas DB
  not exposed from the host; multi-stage admin build; production source maps off.

---

## 5. Prioritised remediation roadmap

1. **H-1** — Fix `updateUser`: require super admin for `permissions` (and other
   staff's `password`/`email`), or drop `permissions` from `updateUserSchema`.
   *(Small, high-value code change.)*
2. **M-2 + M-1 (`proxy-addr`)** — Lock the Nginx origin to Cloudflare IPs / use
   `CF-Connecting-IP`; bump Express. Restores rate-limit integrity.
3. **M-4** — Add security headers to the Nginx server blocks.
4. **M-3 / M-5 / L-5** — Mobile hardening: SecureStore for the token, disable
   production cleartext, `allowBackup=false`. Ship together in the next native
   build.
5. **M-1** — Bump `multer`, `sharp`, `axios`; add `npm audit` to CI.
6. **L-1, L-4, L-6** — Assignee re-validation, socket `isActive` check,
   per-account login throttle.
7. **L-2, L-3, L-7, L-8** — Product decision on reminder edits; attachment
   disposition; delete dead admin slices; strip debug logs.

---

*This report reflects a point-in-time static review. Dynamic testing against a
dedicated staging environment (never production) — auth brute-force, the H-1 and
L-1 exploit paths end-to-end, upload handling, and a Stream call-join
authorization check on Stream's side — is recommended to confirm runtime
behaviour.*
