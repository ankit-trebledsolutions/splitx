# Group calls: only members get in

Fixes audit items **O-2** (anyone who knows a group id can join its call), **O-3** (call billing) and **O-9** (ring spam) from `SECURITY-AUDIT-2026-11-05.md`. Written 2026-11-05.

**Status:** the code and tests are done and uncommitted on `development`. Nothing has been run against a real Stream app. The app change has not been run on a device. The Stream dashboard has not been changed. Sections 2 and 3 are the owner's steps.

---

## 1. What changed

### The design: the server decides who the call's members are

Two ways to fix O-2 were weighed:

- **Call-scoped tokens (`call_cids`)**: rejected. One token would have to list every group the person is in, and be fetched again whenever they join a group. Someone who left a group would keep their token for up to 24 h. The app would also need to reconnect Stream with a new token. Stream's call token also only *adds* membership. It still needs the same dashboard lock as the chosen design.
- **The server sets the call's members** (chosen): this needs the smallest app change, about 15 lines. Before joining any group call, the app asks the server once. The server checks that the person is in the group. It then makes the Stream call's `members` exactly the group's members, each with the `call_member` role, and creates the call the first time a group calls. Once the `default` call type grants joining only to `call_member` (section 3), Stream turns everyone else away.

| Piece | Where |
|---|---|
| `POST /api/v1/stream/call-join {groupId}`: membership check (403 / 404), then `prepareCall`. Answers `{ live }`. | `backend/src/routes/stream.routes.js`, `controllers/stream.controller.js` |
| `prepareCall`: creates the call if needed (`created_by_id` = the caller). Adds missing members as `call_member`, after creating them as Stream users. Sets any other role (e.g. `admin`) back to `call_member`. Removes, blocks and kicks anyone who isn't in the group. Unblocks a returning member. Pages past 100 members. | `backend/src/services/stream.service.js` |
| Leaving or being removed from a group takes the person out of the group's call at once: removed as a member, blocked, kicked. This is not awaited, and never fails the leave. | `group.service.js` `detachMember` → `callAccess.memberLeft` |
| Every minute, anyone in a group's call who isn't in the group is taken out. If the group no longer exists, everyone is taken out. This is the safety net until the dashboard is locked, and for a removal that failed to reach Stream. | `backend/src/services/callAccess.service.js`, run from `walletSweep.service.js` |
| Tests never reach Stream: `stream.outside.client` refuses in `NODE_ENV=test`, in the same way as `r2.outside`. | `stream.service.js` |

The Stream user token is unchanged: unscoped, 24 h. After the lock it grants nothing by itself, because calls are guarded by membership.

### Billing (O-3)

The app already promises users "Paid by whoever starts the call. Joining is free." (Wallet screen). The rules now follow that promise:

- **Only a group member is ever the payer.** A call nobody announced is billed to the *member* who has been in it longest. Previously this was the longest participant, and the call went unbilled if that person was an outsider.
- **The starter pays only while they are in the call.** If the payer is missing from one sweep, no more blocks are charged to them. If they are back by the next sweep (a dropped connection), they carry on paying, including any block that came due meanwhile. If they are still missing 45 s or more later (two sweeps in a row), their bill closes with `endReason: 'payer_left'`, and the **rest of that call is free**. A payer who is removed from the group counts as gone.
- **A starter who comes back to their own call** is billed again from that moment: one fresh block. They are not billed for the time they were away.
- A call's bill never starts more than 2 minutes in the past. Before this change, a call that ran while calls were free and was then priced was charged every block since it began, all at once. When a bill restarts in the same call, it starts where the last one stopped, so no block is charged twice.

Files: `backend/src/services/callBilling.service.js`, `backend/src/models/CallSession.js` (new `payerAwaySince`, new end reason `payer_left`).

### Ringing (O-9)

`end()` still clears the "same call" memory, so a new call rings straight away. A separate limit, which `end()` never touches, allows each group to ring **at most 3 times in 5 minutes**. Posting "started" and "ended" in turn rings the group 3 times and then goes quiet. The call itself still goes ahead; only the phones stay silent. Like the existing dedupe, the limit is kept in memory, per server process. File: `backend/src/services/callRing.service.js`.

### App (needs a new build)

In `mobile/src/context/ActiveCallProvider.js` and `mobile/src/api/stream.api.js`, `join()` now calls `prepareCall(groupId)` before it reads the call. It then joins with `create: false`, because the server has already made the call. A server from before this change answers `404 Route not found`. In that case the app does what it always did: `join({ create: true })`. Any other failure, such as 403 "You are not a member of this group", shows on the call screen as an error.

### Tests

The full suite is `npm test`: **535 pass**, no skips with local MongoDB up. New and extended tests:

- `test/callAccess.test.js` (16): `prepareCall` against a fake Stream, the `/call-join` handler (outsider → 403 and 404, with Stream never asked), leaving a group, the minute sweep.
- `test/callBilling.test.js` (9): runs against local MongoDB in `splix_test_calls`, and is skipped without it. Covers: a starter who leaves, a dropped connection, a starter who comes back, a payer removed from the group, a starter still joining, a call started by an outsider, a call with no members in it, the retroactive-billing cap, and a bill picked up again in the same call.
- `test/callRing.test.js` (+2): alternating started/ended, and that the limit is per group.

---

## 2. Roll-out order

The order matters. Once the dashboard is locked, an old app build can neither create a call nor join one, unless a new build has prepared that group's call since its members last changed.

1. **Deploy the backend.** It is safe with today's app: old builds never call `/call-join`, and the sweeps only remove non-members.
2. **Build and ship the new APK.** Raise `versionCode` in `mobile/app.json`; the force-update notes say build 2 is the first build that can be forced.
3. **Lock the Stream *test* app** (section 3) and run the test plan (section 4) against it.
4. Once most users are on the new build: **Admin panel → App Updates → raise the Android minimum build** (and the iOS one, if there is an iOS build), so older builds see the Update screen.
5. **Lock the production `default` call type** (section 3). Straight away, call from two phones on the new build and confirm it still works.

## 3. Stream dashboard steps (test app first, then production)

Go to dashboard.getstream.io → the app → **Video & Audio → Call Types → `default` → Roles & Permissions**. The labels below are as Stream shows them; in the API they are `join-call`, `read-call` and so on.

1. **Role `call_member`.** Tick **Join Call, Read Call, Send Audio, Send Video**. Also tick any media permission that `user` has today and the app may use, such as Screenshare, Create Reaction or Enable Noise Cancellation. Leave the moderation permissions **off**: End Call, Update Call, Update Call Members / Remove Call Member, Mute Users, Block Users, Kick User, Pin For Everyone, Update Call Settings / Permissions, Change Max Duration, any Start/Stop Recording, Broadcasting, Transcription or Closed Captions, and Join Backstage. The app uses none of them, and the server does those jobs with its own key. Also leave **Join Ended Call** off: the server never ends a group's call. Save.
2. **Role `user`.** Untick **everything**, at minimum Create Call, Read Call and Join Call. Save. From now on only the server creates calls, so nobody can create a group's call (whose id is the group id) before the group first calls.
3. **Roles `guest` and `anonymous`.** Untick everything. Save. The API key is not secret: it is in the app and returned by `/stream/token`. Stream also lets guest and anonymous users connect with the key alone, where the app allows them.
4. **Other call types** (`development` grants everything to everyone by default; also `audio_room` and `livestream`). The app uses only `default`. Untick Create Call and Join Call for `user`, `guest` and `anonymous`, or delete those types if nothing uses them. Otherwise anyone with a Splix login can run their own calls on your Stream bill.

To check the result, run `scripts/stream-access-check.js` against the test app (4.A). Every line should say PASS.

## 4. Test plan (separate Stream test app, never the production keys)

**Setup:**
1. In the Stream dashboard, create a new app, for example `splix-calls-test`, and take its key and secret.
2. Give the app three test accounts (Asha and Ben in one group, and Xavi in no group with them), on a **local** stack:
   ```powershell
   $env:STREAM_API_KEY='<test app key>'; $env:STREAM_API_SECRET='<test app secret>'; npm run dev:local
   ```
3. `dev:local` uses a local database, and these variables win over `backend/.env`. But a Stream key saved in the **local** admin panel (Integrations → Stream) wins over both, so check that it is blank or holds the test app's key.
4. Use only test accounts on this stack.

### A. Stream itself (scripted, about one minute)

```powershell
$env:STREAM_TEST_API_KEY='<test app key>'; $env:STREAM_TEST_API_SECRET='<test app secret>'; node scripts/stream-access-check.js
```

How the script stays safe: it reads only the two `STREAM_TEST_*` variables. It never loads `backend/.env` or anything under `src/`. It refuses to run with the key that is in `backend/.env`.

What it does: it prints the `default` type's grants, then creates a call the way the server does (two members as `call_member`). Then, using each user's own token, it checks:
- members can read and join the call;
- the outsider gets **403** for reading it, joining it (with or without `create: true`) and adding themselves as a member;
- the outsider's `queryCalls` does not list the call;
- a plain user cannot create a call at all.

Afterwards it deletes the calls it made.

Run it in two passes:
1. **Before** locking the test app: the outsider and "create a call" lines should FAIL. This shows the gap is real, and that the script catches it.
2. **After** locking: every line should say PASS.

### B. The server against the test app (local stack, phones or emulator on the new build)

| # | Do | Expect |
|---|---|---|
| 1 | Asha starts a call in a group that has never called | `POST /stream/call-join` answers 200 `{live:false}`. In the Stream dashboard's call list, `default:<groupId>` exists, and its members are the group's members, each with role `call_member`. Ben's phone rings. |
| 2 | Ben answers | Ben joins. His call-join answers `{live:true}`. Neither phone sees a "not allowed" error. |
| 3 | Xavi's token calls `POST /api/v1/stream/call-join` with the group's id | 403 "You are not a member of this group". The call's members are unchanged. |
| 4 | Xavi, outside the app, joins `default:<groupId>` with his own Stream token (script A does exactly this) | 403 |
| 5 | Mid-call, the group admin removes Ben (his balance must be settled first) | Ben's phone drops out of the call within seconds. Calling or joining again gives 403. In the dashboard, Ben is no longer a member and is blocked on that call. |
| 6 | Ben is invited back and calls | He joins: his own call-join unblocks him. |
| 7 | An old build (from before this change) tries to call after the lock | It fails. This is expected, and is why step 4 of section 2 raises the minimum build. |

### C. Billing

In the local admin panel, set the call price to 1 and the block to the shortest length allowed, and give Asha some credits. Check `callsessions` in the local database (`splitx_dev`) with mongosh, and the Wallet history in the app.

| # | Do | Expect |
|---|---|---|
| 1 | Asha starts, Ben joins, Asha hangs up after two blocks, Ben stays on for several more | Asha's charges stop within about two minutes of her leaving. Ben is never charged. The session ends with `payer_left`. |
| 2 | Asha's phone loses Wi-Fi for about 20 s mid-call | She keeps paying; there is no `payer_left`. |
| 3 | After case 1, Asha rejoins Ben's call | One fresh block is charged to Asha, from that moment. |
| 4 | Asha is removed from the group mid-call | Asha's bill stops, as in case 1, and she is taken out of the call. |

### D. Ringing

Start and hang up a call from Asha's phone 5 times within a minute, or alternate `POST /stream/call-event` `started` and `ended` with her token. Ben's phone rings **3 times**, then stays quiet until 5 minutes have passed since the first ring.

---

## 5. Judgement calls and limits

- **Free after the starter leaves.** This keeps the promise that joining is free. The cost is a loophole: someone can start a call, pay one block, leave, and the others talk for free. The alternative is to move the bill to the member who has been in the call longest. That would charge someone who only joined, so it should come with a notice in the app. It is a small change in `sessionFor`, in the `payer_left` branch.
- A payer counts as gone only after being missing from two sweeps in a row. So a starter who leaves just before a block boundary is not charged that block; one whose phone was only dropping is charged it when they are back.
- The ring limit is kept in memory, per server process, like the existing dedupe. With several API servers, each one counts separately.
- The chat lines ("Asha started a call" / "Call ended") are **not** limited. Spamming call-event still adds lines to the chat, but no longer rings anyone. This is a possible follow-up.
- Each join adds one Stream request to `/call-join` (`getOrCreate`). There are a few more only when the membership has changed. The first join in each existing group adds every member, because calls made so far have no members.
- The sweep leaves alone calls whose id is not a group id, such as a test call from the dashboard. Locking the call types (section 3) is what stops those.
- No backend lint ran: `backend/` has no ESLint config or install, so `npm run lint` fails in any case.
