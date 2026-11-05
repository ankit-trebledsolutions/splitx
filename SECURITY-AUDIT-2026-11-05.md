# Splix: Security Audit Report

**Date:** 2026-11-05
**Branch:** `development` @ `3273bfb`, plus the uncommitted fixes listed in §6
**Scope:**
- the backend (Express, MongoDB and Socket.IO)
- the admin panel (React/Vite)
- the mobile app (Expo/React Native and its Kotlin module)
- the face service (Python)
- deployment files (Nginx, Docker, VPS script)

**Previous audit:** `SECURITY-AUDIT-2026-10-13.md`. This audit re-checks every finding in it.

**How it was tested:**
- I reviewed the code (I covered auth, admin, uploads and storage; three parallel reviewers covered the rest of the backend, the mobile app, and the panel with the deploy and face-service files).
- I ran the existing test suite and `npm audit`.
- I ran live tests against an **isolated copy of the API**:
  - local MongoDB with throwaway databases, port 4100, `NODE_ENV=production`, `TRUST_PROXY=2` as in docker-compose;
  - no R2 and no email key;
  - every outbound request to a provider blocked (0 were attempted).
- Nothing touched production, Atlas, R2, Stream, Resend, OpenAI or Geoapify. `backend/.env` was never loaded.

> **One deliberate limit:** I did not build or run a working reproduction of the Google
> sign-in account-takeover path (N-1). That finding is confirmed by tracing the code
> end to end, and the fix is verified by regression tests that assert the secure outcome.

---

## 1. Executive summary

Splix is in **good shape**:
- Group data is isolated. All 18 cross-group read, write and delete checks were refused.
- The admin permission model holds, including the October H-1 fix, which I re-verified live.
- No injection was found, and secrets handling is sound.

This audit found and **fixed** one High-severity account-takeover path and seven Medium issues. Most were about session handling and guessing limits. Every fix has a regression test, and the live probes that showed each issue pass after the fix.

What is still open is mostly **operational**, so it can't be fixed in code alone:

1. **High:** release APKs are signed with the public React Native debug keystore.
2. **High (likely):** video calls can probably be joined by any signed-in user who knows a group's id. Not tested against Stream.
3. **High while active:** sign-up email verification is in "test mode" in production (codes are shown in the app), so email ownership is not proven. Partly mitigated in code (N-1); fully fixed by verifying a sending domain.
4. **Medium:** the origin server is not locked to Cloudflare, and the Nginx-served admin panel has no security headers.
5. **Medium:** the mobile session token is kept in plaintext storage.

---

## 2. Application architecture

| Part | Technology | Auth model |
|---|---|---|
| API `backend/` | Node 18+, Express 4, Mongoose 8, zod, Socket.IO 4, multer, sharp | App: Bearer JWT `{sub}`, 7 days. Panel: httpOnly cookie with an `{sub, scope:'admin'}` JWT (8 h, or 30 d with "remember me") plus an `X-Admin-Request` CSRF header |
| Database | MongoDB Atlas (production) | Group-scoped data. `getGroupForMember` is the tenant guard |
| Files | Cloudflare R2 (private bucket; `/media/<key>` redirects to a 1 h signed URL). Local `backend/uploads` fallback | Capability URLs (96-bit random keys) |
| Admin panel `admin/` | React, Vite, RTK Query, TinyMCE 8 (self-hosted, GPL) | Roles `super_admin` / `admin` / `user`, plus per-module permissions read from the database on every request |
| Mobile `mobile/` | Expo 54, RN 0.81, own Kotlin module `splix-alarm`, Stream Video SDK | JWT in AsyncStorage. Socket handshake uses the same JWT |
| Face service `face-service/` | FastAPI, OpenCV YuNet+SFace, Pillow | Internal Docker network, no auth |
| Integrations | Stream (calls), Resend (email), OpenAI (itinerary), Geoapify (places), Google Sign-In, Expo push | Keys in env, or in the panel vault (AES-256-GCM) |
| Edge | Cloudflare, then Nginx (TLS), then the API container | `TRUST_PROXY=2` |

The API exposes about 150 routes in 21 routers. The public, unauthenticated ones are:
- `/api/v1/auth/*`
- `/api/v1/health`
- `/api/v1/app/{release,branding}`
- `/api/v1/places` (region lists)
- `/join/:code` and `/.well-known/assetlinks.json`
- `/media/*` and `/uploads/*`
- `POST /api/v1/admin/auth/login`

---

## 3. Audit checklist and status

| Area | Checks | Result |
|---|---|---|
| Authentication | hashing (bcrypt 12), OTP (hashed, 5 tries, cooldown, hourly cap), brute force, JWT algorithm and tampering, token types, expiry and revocation, Google linking, reset flow, enumeration | **N-1, N-3, N-4, N-6 found and fixed.** N-2 mitigated. Enumeration on sign-up only (Info) |
| Authorization / IDOR | 18 outsider read, write and delete attempts across groups, expenses, tasks, messages, photos and stays; member-level rules; admin roles and modules | Sound. **L-1 (N-9) and N-10 found and fixed** |
| Admin API | H-1 re-test, owner hiding, module guards, CSRF header, CORS, page-size cap, regex and operator input, login brake | Sound. **N-12 fixed** |
| API input | operator objects, malformed ids, oversized bodies, pagination, link schemes, duplicate ids | **N-10, N-13 fixed** |
| Injection | NoSQL operators, `$regex` escaping, no `eval`/`child_process`, Geoapify URLs | Sound |
| XSS | join page (escaping + nonce CSP), panel sinks, TinyMCE, sandboxed email preview, uploaded HTML/SVG | **N-8 fixed** |
| CSRF / CORS | custom header + allowlisted credentialed CORS | Sound |
| SSRF | places, face service, AI | Sound (fixed hosts, encoded params) |
| File upload | type, size, traversal, non-member, MIME spoofing, decompression bombs | **N-8, N-11 fixed** |
| Realtime | handshake, rooms, suspended users | **N-7 fixed** |
| Calls / billing | Stream token scope, call join, billing | **Open: O-2, O-3, O-9** |
| Mobile | storage, cleartext, backup, deep links, URL opening, exported components, signing | **N-13 fixed.** **Open: O-1, O-6, O-7, O-8** |
| Config / infra | headers, real IP, ports, Dockerfiles, secrets in git | **Open: O-4, O-5.** Secrets OK |
| Supply chain | `npm audit` on all three packages | Backend critical removed. **Rest open** (§7) |
| Logging / errors | 500s hidden in production, no tokens or OTPs logged | Sound. **L-8 (panel logs) fixed** |

---

## 4. Findings

Severity follows impact × likelihood. **Confirmed** means reproduced live, or traced end to end in code. **Potential** means the code strongly indicates the issue, but the dependency (Stream, infra) could not be tested.

### 4.1 Confirmed and fixed

#### N-1: Google sign-in links onto an account whose email nobody proved. **High.** Confirmed by code trace; fix verified.
- **Where:** `backend/src/services/auth.service.js`, `loginWithGoogle` step 2 (now around lines 294-316). Endpoint: `POST /api/v1/auth/google`.
- **Root cause:**
  - A password account is created at sign-up before the email is verified.
  - When someone later signs in with Google using the same address, the account was linked and marked verified, but the password set at sign-up was kept.
  - Whoever created that sign-up keeps password access to the real owner's account, and keeps any session they already had.
  - In test mode (N-2) this also applies to accounts "verified" with an on-screen code.
- **Impact:** full takeover of an account (groups, expenses, chat, photos) belonging to someone who joins with Google after another person pre-registered their address.
- **Fix:**
  - When Google links to an account that is unverified, or verified only by an on-screen code (`emailUnproven`), the password and pending code are removed.
  - Every session made before the link ends (`sessionsResetAt`), and live sockets are dropped.
  - Properly verified accounts keep their password, as before.
- **Verified by:** `test/securityFixes.test.js`, the three "Google sign-in onto…" tests:
  - the old password no longer signs in;
  - the old session returns 401;
  - the new Google session works;
  - a verified account is unaffected.

#### N-2: Email ownership is not proven while the sender is `@resend.dev`. **High while active.** Confirmed live; mitigated.
- **Where:** `auth.service.js` `issueOtp` (`shownInApp`, around line 58). Endpoint: `POST /api/v1/auth/register`.
- **Root cause:** a deliberate "test mode". The production sender is Resend's test address, so the sign-up code is returned in the API response (`devOtp`). This was confirmed live (A1).
- **Impact:** anyone can create a verified-looking account under any address.
- **What changed:** such accounts are now marked `emailUnproven`, so N-1's protection applies to them. Reset codes are never shown.
- **Still needed:** verify a sending domain in Resend and set it in the panel. That turns test mode off with no deploy.

#### N-3: Password-reset and admin tokens are accepted as app sessions. **Medium.** Confirmed; fixed.
- **Where:** `middleware/auth.js:21` and `realtime/socket.js:69`. New helper: `utils/sessionToken.js`.
- **Root cause:** all JWTs share one secret. `protect` and the socket checked only the signature, so the 15-minute `purpose:'password-reset'` token, and the panel's `scope:'admin'` token, opened full app sessions. That gives silent account access without changing the password, so no "password changed" email is sent.
- **Fix:** only plain `{sub}` tokens open an app session.
- **Verified by:** test "a password-reset token and an admin token do not open an app session", and live check S2 (the socket refuses a reset token).

#### N-4: Sessions survive a password reset or change. **Medium.** Confirmed; fixed.
- **Where:** `models/User.js` (new `sessionsResetAt`, set in the pre-save hook), checked in `middleware/auth.js:26`, `middleware/adminAuth.js:71` and `realtime/socket.js:72`.
- **Root cause:** 7-day stateless JWTs with no revocation. Resetting a password (or an admin changing it) did not sign out a thief.
- **Fix:**
  - Any password change or removal ends every session issued earlier, compared at `iat` second precision so the sign-in right after still works.
  - Sockets are disconnected.
  - **Existing sessions are not affected by deploying this.**
- **Verified by:** tests "changing the password ends the sessions…", "an admin session from before the password changed has ended", and "a brand-new account and an edit that leaves the password alone end no session".

#### N-5: Group invite codes can be guessed with no limit. **Medium.** Confirmed live; fixed.
- **Where:** `routes/group.routes.js:291,293`, new `middleware/guessLimiter.js`. Endpoints: `GET /api/v1/groups/invites/:code` and `POST /api/v1/groups/join`.
- **Root cause:** codes are 32 bits (`models/Group.js:62`) and neither route was rate limited. The preview silently reveals the group's name, members and location, and joining gives full access. Live: 150 wrong guesses from one account, none refused (G1).
- **Fix:** 20 failed lookups or joins per account per 15 minutes. Successful ones are never counted. Live after the fix: 429 on the 21st wrong guess.
- **Still recommended:** longer codes (≥ 64 bits) and an admin "rotate code" action.

#### N-6: No per-account sign-in brake; the per-IP limit trusts a header the caller can set. **Medium.** Confirmed live; fixed in the app (infra part open as O-4).
- **Where:** `routes/auth.routes.js:91`, `middleware/guessLimiter.js`. Endpoint: `POST /api/v1/auth/login`.
- **Root cause:** only `app.js`'s per-IP limit (50 per 15 minutes) applied, and the IP comes from `X-Forwarded-For` with 2 trusted hops. Live: 55 wrong passwords for one account with a different claimed IP each time, none refused (L4). Same for October's L-6.
- **Fix:** 10 wrong passwords per email per 15 minutes, from any IP, then a 429. This mirrors the panel's limiter. Google sign-in and "Forgot password" still work. Live after the fix: 55 of 55 refused.
- **Trade-off:** someone can deliberately pause password sign-in for a known email for 15 minutes.

#### N-7: Suspended or deleted users keep their live socket. **Low.** Confirmed live; fixed (October L-4).
- **Where:** `realtime/socket.js:66-74` (handshake), new `disconnectUser` (around line 307), called from `admin.service.js` `setActive`/`deleteUser`/`updateUser` and from `auth.service.js`.
- **Live before:** a suspended account's socket connected (S1).
- **Live after:** the connection is refused with `ACCOUNT_SUSPENDED`, and an already-open socket is dropped the moment an admin suspends the account (S3).

#### N-8: Uploaded HTML/SVG served as a live page. **Medium.** Confirmed live in local-storage mode; fixed.
- **Where:**
  - `app.js:40` (`/uploads` static)
  - `storage/r2.storage.js` `put` (was `inline` for every type)
  - new `storage/servePolicy.js`
- **Root cause:**
  - Chat accepts any file type.
  - Local storage keeps the uploader's extension and serves the file from the API origin, which both Nginx templates also proxy on the panel origin.
  - R2 stored everything with `Content-Disposition: inline` and the uploader's MIME type.
  - Live: an uploaded `.html` was served as `text/html` (U1). An HTML file declared as `image/png` was also accepted by the gallery and served as HTML (U2).
- **Impact:** in local mode, a script running on the API/panel origin can perform admin actions with the CSRF header if an admin opens the link. With R2 the risk is lower, because the content runs on R2's own origin.
- **Fix:**
  - Only pictures, video, audio and PDF are shown in place.
  - Anything else is `attachment`. The local folder also adds `Content-Security-Policy: sandbox; default-src 'none'`.
- **Verified:** live U1 and U2 now download sandboxed. New tests cover R2 dispositions and `/uploads` headers.

#### N-9: Cross-group name/email disclosure through tasks. **Low.** Confirmed live; fixed (October L-1, plus a new variant).
- **Where:** `services/task.service.js` (`assertMembers`, `sourceFor`).
- **Root cause:** `PATCH /api/v1/tasks/:id` did not re-check `assignees` (L1, live). `POST /groups/:id/tasks` stored `source.user` unchecked (X1, live). The response, and the chat card sent to the group, populate `name email`.
- **Fix:** assignees must be members. The quoted person is read from the quoted message, which must be in this group. Without a message, only a member may be named.
- **Verified:** live L1 and X1, plus two tests.

#### N-10: The same person listed twice in an expense. **Low.** Confirmed live; fixed.
- **Where:** `services/expense.service.js` (`assertNoRepeats`).
- **Impact:** the duplicate share can never be settled, which blocks the victim from leaving the group or deleting their account (X2, live).
- **Fix:** expenses with duplicate participants or splits get a 400. Verified live and by test.

#### N-11: An image "bomb" crashes the face service in a loop. **Medium.** Confirmed in a local decode check; fixed.
- **Where:** `face-service/app.py` `decode`. Hardening also added in `storage/r2.storage.js` `squareOf`.
- **Root cause:** an 87 KB PNG that claims 90 megapixels was fully decoded and copied twice (about 1.6 GB of memory). The 5xx/timeout response was then retried every 30 seconds without end.
- **Fix:**
  - The pixel count is checked from the header before decoding: 413 above 64 MP (environment variable `FACE_MAX_PIXELS`).
  - `DecompressionBombError` returns 413.
  - A 4xx is already treated as "unreadable", which is not retried (`faceService.client.js:84`).
  - R2 thumbnails skip inputs above 52 MP.
- **Verified:** the bomb returns 413 at 0.4 MB peak memory, and a normal 12 MP photo still decodes.

#### N-12: Admin JWT returned in the sign-in response body. **Low.** Confirmed live; fixed.
- **Where:** `controllers/admin.controller.js:28`.
- **Root cause:** returning the token undid the cookie being httpOnly. Any script on the panel's origin could read a token valid for up to 30 days.
- **Fix:** browsers (requests with an `Origin` header) get only the cookie. curl and tests still get the token.
- **Verified:** live C2 and a test.

#### N-13: Task links open any URL scheme. **Low.** Confirmed by code; fixed.
- **Where:** `mobile/src/screens/TaskDetailScreen.js:276`, and the zod schemas in `routes/group.routes.js` and `routes/task.routes.js`.
- **Root cause:** any member could add a `upi://pay?…`, `tel:` or deep link that opens with one tap.
- **Fix:** links must be `http(s)://`, enforced by the API (tested) and by the app. The app change ships in the next APK and has not been run on a device.

#### Smaller fixes
- Reset codes are never returned as `devOtp`, even on a server mistakenly started without `NODE_ENV=production` (`auth.service.js:100`).
- Panel `console.log`s of co-admin objects and login errors removed (October L-8).
- Panel sign-out now clears all 10 API caches; previously support, wallet, app-release and branding data stayed in the tab.

### 4.2 Confirmed or likely, still open

| ID | Severity | Finding | Where | Why not fixed here |
|---|---|---|---|---|
| **O-1** | **High** | Release APKs are signed with the stock RN **debug keystore**, whose key is public. Anyone can build an APK that installs as an "update" over Splix (it is sideloaded via `downloadUrl`), inherits its data and token, and passes the App Links and Google SHA-1 checks. | `mobile/android/app/build.gradle:120`; assetlinks default `backend/src/config/env.js:193-200` | Needs a private keystore that you create and keep. Existing installs must uninstall once. |
| **O-2** | **High (potential)** | Calls are not scoped on the server. `GET /stream/token` mints an unscoped 24 h user token. The app joins `call('default', <groupId>).join({create:true})` with no member list. Since non-starting members can already join, the `user` role evidently has JoinCall, so **anyone who knows a group id can likely join that group's call**. Group ids leak to ex-members and through the invite preview. | `services/stream.service.js:32-36`; `mobile/src/context/ActiveCallProvider.js:134,169` | Needs Stream call-type permissions and server-created calls with members, or call-scoped tokens. Needs a Stream test app. |
| **O-3** | Medium | Call billing: a call started by a non-member is never billed. The starter keeps being charged after leaving while others stay, which drains their credits. | `services/callBilling.service.js:133-136, 192-198` | Depends on Stream participant data; design change. |
| **O-4** | Medium | Origin not locked to Cloudflare. `X-Forwarded-For` is appended, not replaced, and 2 hops are trusted, so a caller hitting the VPS IP directly picks their own IP for every per-IP limit. Docker-published ports bypass UFW. | `deploy/nginx/templates/default.conf.template:38,64`; `docker-compose.yml:13` | Production config. Snippet in §8. |
| **O-5** | Medium | No security headers on the Nginx-served panel (no XFO/`frame-ancestors`, CSP, nosniff or Referrer-Policy), so clickjacking of one-click admin actions is possible. `server_tokens` is on. | both Nginx templates | Production config. Snippet in §8. |
| **O-6** | Medium | Mobile: JWT and user blob in plaintext AsyncStorage (M-3). `usesCleartextTraffic: true` (M-5; the debug manifest already enables it for dev). `allowBackup` is true (L-5). | `mobile/src/api/client.js:38,52`; `mobile/app.json:57` | Native/config change and a new build. Confirm the no-domain (http) test setup is no longer needed before turning cleartext off. |
| O-7 | Low | Expo push is sent without an access token. Anyone holding a leaked push token can make a phone ring a fake call or alarm. | `services/push.service.js:20-23`; `SplixMessagingService.kt` | Turn on push security in Expo and set `EXPO_ACCESS_TOKEN`. |
| O-8 | Low | The exported launcher activity accepts `EXTRA_OPEN` JSON from any app, and the routed ids are not validated, so a local app can open screens with chosen ids (client-side path traversal into API paths). | `modules/splix-alarm/.../SplixAlarmModule.kt:76-88`; `src/utils/reminderAlarms.js:240`; `src/utils/incomingCalls.js:67` | Mobile change. Accept `/^[a-f0-9]{24}$/` only. |
| O-9 | Low | Ring spam: alternating `POST /stream/call-event` started/ended resets the 15 s dedupe and rings every member's phone full-screen. | `services/callRing.service.js:109` | Throttle per group, independent of `end()`. |
| O-10 | Low | Any member can edit or disable another member's group reminder (October L-2). | `services/reminder.service.js:202-214` | Product decision. |
| O-11 | Low | Dead panel slices without the CSRF header (October L-7). Not mounted and not in the bundle. | `admin/src/features/{category,general,image-carousel}` | Deleting features was out of scope. Recommend deleting. |

### 4.3 Informational / improvements
- `mobile/splix-e3191-firebase-adminsdk-*.json` (a **server** credential) sits in the mobile folder. It is correctly ignored by git and `.easignore`, is not bundled, and has never been committed. Move it off the mobile project; rotate it if it isn't used.
- Account enumeration: `POST /auth/register` answers "already exists", and login names Google-only accounts. The reset and resend flows are silent. Accept, or make sign-up silent.
- `POST /conversations` returns 404 for an unknown user id and 403 for "no shared group", which reveals whether an id exists.
- Photo `imageUrl` (JSON add) accepts any URL, so a tracking pixel loads on every member's phone. Expense `amount` has no upper bound. A debtor can mark their own share settled.
- Infra hardening:
  - no `read_only`, `cap_drop` or `no-new-privileges` on containers;
  - Docker logs are not rotated;
  - base-image tags float;
  - `setup-vps.sh` leaves SSH password/root login as is and adds no fail2ban;
  - the face service shares the default network (use an `internal: true` network).
- Face service dependencies: `fastapi==0.115.0` pins Starlette below the multipart DoS fix, and `python-multipart==0.0.9` is below 0.0.18. Pillow parses untrusted bytes, so keep it current.

### 4.4 Re-verified as sound (do not re-litigate)
- **Tenant isolation:** 18/18 outsider attempts refused, covering groups, expenses, messages, photos, tasks, balances, itinerary, stays, deletes and bulk delete.
- **Member rules:** members cannot delete others' messages, remove the admin or delete the group. Payer and split members are validated. Exact splits must add up.
- **Admin (H-1 fixed):**
  - a co-admin cannot self-grant modules, reset a peer admin's password, promote users, see or suspend owners, or reach integrations, wallet or app-release;
  - the CSRF header is required for cookie requests;
  - an unknown origin never gets credentialed CORS;
  - page size is capped, search is regex-escaped, and query operators are rejected;
  - admin login is limited per email.
- **Tokens:** `alg:none` and tampered tokens are refused. App tokens are refused by the admin API.
- **Input:** NoSQL operator objects get a 400. Malformed ids get a 400 (not a 500). Bodies over 1 MB get a 413. Uploads over 10 MB get a 413. Filenames cannot traverse. Non-members cannot upload.
- **Join page:** HTML-escaped with a strict nonce CSP. Helmet headers are on the API, with no `X-Powered-By`.
- **OTP:** locks after 5 wrong codes, with cooldown and hourly cap. Passwords: bcrypt cost 12.
- **Other:** the vault, the sandboxed email preview, TinyMCE defaults, no SSRF in places, no secrets in the panel or app bundles, and the API container runs as non-root.

---

## 5. Security testing results

| Test | Before fixes | After fixes |
|---|---|---|
| Backend suite (`npm test`) | 487/487 pass | **506/506 pass** (19 new: `test/securityFixes.test.js` ×18, `r2Storage.test.js` ×1) |
| Live API probes: headers, tokens, injection, IDOR, member rules, join page, invite guessing, OTP, sign-in limits (40 checks) | 37 secure, **3 vulnerable** (L1, G1, L4) | **40/40 secure** |
| Live admin, upload and socket probes (21 checks) | 17 secure, **4 vulnerable** (C2, U1, U2, S1) | **21/21 secure** |
| Live extra probes: task source, duplicate split (2 checks) | **2 vulnerable** | **2/2 secure** |
| Live socket probes: reset token, drop on suspend (2 checks) | not run | **2/2 secure** |
| Face-service decode check (stubbed models) | bomb decoded | **413**, 0.4 MB peak; normal photo OK |
| Admin panel `vite build` | n/a | builds; removed logs are absent from the bundle |
| Mobile changed file | n/a | parses (Babel); **not run on a device** |
| `npm audit` backend | 10 (1 critical, 5 high) | **6 (0 critical, 2 high: `sharp`, `zod`, both major upgrades)** |
| `npm audit` admin / mobile | 22 (17 high) / 42 (1 critical, 20 high) | unchanged (not upgraded, see §7) |

**Not performed, and what each needs:**
- **Stream call join (O-2):**
  - **Needs:** a separate Stream test app and two test accounts.
  - **Test:** an account outside group B runs `@stream-io/video-client` with its own token: `call('default','<B id>').join()` during a call. Also check `queryCalls({filter_conditions:{ongoing:true}})`.
  - **Expected after fixing:** 403, and no other groups' calls listed.
- **R2 path** (signed URLs, real `ContentDisposition` from the bucket, sharp on real photos): needs a test bucket. The code path is covered by unit tests with a fake S3 client.
- **Nginx and Cloudflare (O-4, O-5):**
  - **Needs:** access to staging.
  - **Tests:** `curl -H 'X-Forwarded-For: 1.2.3.4' https://<origin-ip>/api/v1/health` should be refused, and `curl -I https://<panel>/` should show the headers.
- **Mobile on-device:** token storage, cleartext, the link change, and the 429/401 handling on sign-in.
- **Real Google token verification and Resend delivery:** stubbed or blank by design.
- **Load/DoS:** excluded by the rules of engagement.

---

## 6. Fixes applied (uncommitted on `development`)

| File | Change |
|---|---|
| `backend/src/utils/sessionToken.js` (new) | `isAppSession`, `issuedBeforeReset` |
| `backend/src/middleware/guessLimiter.js` (new) | per-email login limiter, per-account invite limiter |
| `backend/src/storage/servePolicy.js` (new) | inline vs. download rules, `/uploads` headers |
| `backend/src/models/User.js` | `emailUnproven`, `sessionsResetAt`, `otp.shown`; hook sets `sessionsResetAt` on any password change or removal; toJSON strips the new fields |
| `backend/src/middleware/auth.js`, `middleware/adminAuth.js`, `realtime/socket.js` | token-type, reset-time and suspended checks; `disconnectUser` |
| `backend/src/services/auth.service.js` | N-1/N-2 handling, no reset `devOtp`, disconnect on reset |
| `backend/src/services/admin.service.js` | disconnect on suspend, delete and password change |
| `backend/src/services/task.service.js`, `services/expense.service.js` | membership and duplicate checks |
| `backend/src/routes/auth.routes.js`, `group.routes.js`, `task.routes.js` | limiters, `http(s)` links |
| `backend/src/storage/r2.storage.js`, `backend/src/app.js` | dispositions, pixel cap, `/uploads` headers |
| `backend/src/controllers/admin.controller.js` | no token in the body for browsers |
| `backend/package-lock.json` | `npm audit fix` (non-breaking): multer 2.5.0, proxy-addr 2.0.8, body-parser 1.20.9, qs, morgan, brace-expansion |
| `backend/test/securityFixes.test.js` (new), `test/r2Storage.test.js` | regression tests |
| `face-service/app.py` | pixel cap before decode, bomb error returns 413 |
| `admin/src/...` (3 files) | debug logs removed, full cache reset on sign-out and sign-in |
| `mobile/src/screens/TaskDetailScreen.js` | opens `http(s)` links only |

**Behaviour changes to know about:**
- After 10 wrong passwords for one email in 15 minutes, password sign-in for that account waits (429). Google and reset still work.
- Changing or resetting a password signs out every other device. This includes an admin who changes their own password in the panel: they must sign in again.
- Google sign-in on an unverified or test-mode account removes its password. "Forgot password" can set one again once email delivery works.
- Chat files that aren't pictures, video, audio or PDF (e.g. `.txt`, `.docx`) now download instead of opening in the browser.
- New task links must start with `http://` or `https://`. Existing links are untouched in the database; the new app build won't open others.
- After 20 wrong invite codes in 15 minutes, that person waits.
- Faces in photos over 64 MP are not indexed, and R2 squares are not made for photos over 52 MP (the photo itself still uploads).
- **Deploying invalidates no existing session.** No migration is needed.

---

## 7. Remaining risks
- **O-1** (signing key), **O-2** (calls) and **N-2** (test-mode email) are the three items that still allow access to other people's data or devices.
- **O-4/O-5** (infra) and **O-6** (mobile storage) are defence-in-depth gaps.
- **Dependencies:**
  - backend: `sharp` 0.35 (libvips/libheif CVEs, reachable via uploads; partly mitigated by N-11's pixel cap) and `zod` 4 (memory DoS on oversized collections; most arrays here are capped) both need major upgrades;
  - admin: `npm audit fix` is available for tinymce, vite, react-router and postcss, but needs a browser check of the editor;
  - mobile: axios has a fix available; react-navigation needs majors; most of the rest is build tooling.
- Logout is still client-side only. There is no server-side revocation of a single session, only "all sessions" through a password change.
- The mobile and admin changes have not been run in a browser or on a device.

## 8. Security score

**Qualitative: Good. Strong application-layer controls; operational hardening incomplete.**

Access control, injection resistance, secrets handling and the admin permission model are well built and held under every test run. The weaknesses are concentrated in deployment and release (signing key, edge config, email test mode) and in the third-party call service's permissions. This is not a claim that the application is completely secure. The untested areas are listed in §5.

## 9. Recommendations before the next production deploy (in order)
1. **Deploy these backend fixes** (backend deploy). Ship the app change in the next APK. Rebuild the face-service image.
2. **Verify a sending domain in Resend** and save it in Admin → Third-Party APIs. This ends test mode (N-2).
3. **Create a private release keystore** (O-1), set `ANDROID_CERT_SHA256` and the Google OAuth SHA-1 to it, and have testers reinstall once.
4. **Lock calls on Stream (O-2):** remove JoinCall from the `user` role on the `default` type, create calls on the server with `members` set to the group, or mint call-scoped tokens from a membership-checked endpoint. Then fix billing (O-3) and ring throttling (O-9).
5. **Nginx (O-4, O-5).** In both server blocks:
   ```nginx
   # Cloudflare only (list from https://www.cloudflare.com/ips/, keep updated)
   set_real_ip_from 173.245.48.0/20;   # ...one line per range
   real_ip_header CF-Connecting-IP;
   proxy_set_header X-Forwarded-For $remote_addr;   # and TRUST_PROXY=1
   server_tokens off;
   add_header X-Frame-Options DENY always;
   add_header X-Content-Type-Options nosniff always;
   add_header Referrer-Policy no-referrer always;
   add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-<inline theme script>'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" always;
   ```
   - Add a `default_server` that rejects requests to the bare IP (`ssl_reject_handshake on`).
   - Allow-list Cloudflare ranges, or use Cloudflare Tunnel or Authenticated Origin Pulls.
   - UFW cannot do this for Docker-published ports.
6. **Mobile hardening build (O-6, O-7, O-8):**
   - `expo-secure-store` for the token;
   - remove `usesCleartextTraffic`;
   - set `android.allowBackup: false`;
   - Expo push access token;
   - validate ids from intents and notifications.
7. **Dependencies:** `sharp` 0.35 and `zod` 4 in the backend (re-test uploads and validation); `npm audit fix` in the admin panel, then check the editor in a browser; axios in mobile. Add `npm audit --omit=dev` to CI.
8. Lengthen invite codes and add "rotate invite code". Delete the dead panel slices. Move the Firebase admin key out of `mobile/`.
