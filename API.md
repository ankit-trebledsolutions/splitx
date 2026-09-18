# Splix API Documentation

REST API for Splix — the expense-splitting and group trip-planning app.

- **Base URL (local):** `http://localhost:4000/api/v1`
- **Format:** JSON request and response bodies (`Content-Type: application/json`), except photo upload which is `multipart/form-data`.
- **Uploaded images** are served statically from `http://localhost:4000/uploads/<filename>` (no auth required).

## Conventions

### Response envelope

Every successful response is wrapped in:

```json
{ "success": true, "data": { ... } }
```

Every error response is:

```json
{ "success": false, "message": "Human-readable error message" }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed (zod/Mongoose) or malformed id |
| 401 | Missing/invalid/expired JWT |
| 403 | Authenticated but not allowed (e.g. not a group member) |
| 404 | Resource or route not found |
| 409 | Duplicate value (e.g. email already registered) |
| 429 | Rate limit exceeded (auth routes: 50 requests / 15 min per IP) |
| 500 | Server error |

### Authentication

All endpoints **except** `/health` and the `/auth/*` routes require a JWT:

```
Authorization: Bearer <token>
```

The token is returned by `POST /auth/register` and `POST /auth/login`.

### IDs and dates

- All ids are MongoDB ObjectIds (24-char hex strings).
- Dates are accepted as ISO-8601 strings (e.g. `"2026-08-15T10:00:00.000Z"`) and returned in the same format.
- All documents carry `createdAt` / `updatedAt` timestamps.

---

## Health

### `GET /health`

No auth. Returns `{ "success": true, "status": "ok" }`.

---

## Auth

Email sign-up is two steps: `register` creates an **unverified** account and emails a 6-digit code, and `verify-email` exchanges that code for a session. No token is issued until the address is proven. Accounts created before verification existed, and Google accounts, count as verified.

**One-time codes** (sign-up and password reset alike): valid 10 minutes, single use, dead after 5 wrong guesses, at most one per 60 seconds and 5 per hour per account. Only a hash is stored.

**Error codes.** Auth errors the app needs to branch on carry a `code` next to `message`:

| `code` | Status | Meaning | Extra fields |
| --- | --- | --- | --- |
| `EMAIL_NOT_VERIFIED` | 403 | Right password, address never confirmed. A fresh code was emailed (unless one went out in the last 60s). | `email`, `retryAfter` |
| `OTP_COOLDOWN` | 429 | A code was requested less than 60s ago; the earlier one is still valid. | `retryAfter` (seconds) |
| `OTP_LIMIT` | 429 | 5 codes already sent this hour. | |

### `POST /auth/register`

| Body field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 2–60 chars |
| `email` | string | required, valid email |
| `password` | string | required, min 8 chars |

Before anything is sent, the address is checked: common typos get a suggestion (`gmial.com` → "Did you mean …@gmail.com?"), throwaway inbox domains are refused, and the domain must be able to receive mail (DNS). All `400`.

An email that is registered but **still unverified** can be registered again: the new name and password replace the old and a new code is sent, so an address can't be blocked by someone who doesn't own it. A verified email answers `409`.

**Response `201`:** `{ "data": { "verificationRequired": true, "email", "sent": true, "retryAfter": 60 } }` and no token. `devOtp` is added only when the server has no email provider configured and is not in production.

### `POST /auth/verify-email`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required |
| `otp` | string | required, exactly 6 digits |

Marks the account verified, sends the welcome email and logs the person in.

**Response `200`:** `{ "data": { "user": { "_id", "name", "email", "emailVerified": true, ... }, "token": "<jwt>" } }`

### `POST /auth/resend-code`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required |
| `purpose` | enum | `verify-email` \| `reset-password` |

Always answers `200 { "sent": true, "retryAfter": 60 }` for unknown or already-verified emails, so it can't be used to discover accounts.

### `POST /auth/login`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required |
| `password` | string | required |

**Response `200`:** `{ "data": { "user", "token" } }`. An unverified account gets `403 EMAIL_NOT_VERIFIED` (only after the password checks out, so it reveals nothing to a guesser).

### `POST /auth/google`

Body: `{ "idToken" }`. Signs up or logs in with Google; the account is verified from the start.

### `GET /auth/me` 🔒

Returns the authenticated user: `{ "data": { "user": { ... } } }`

### `GET /auth/invite-code` 🔒

The caller's personal invite code, shown on the Invite Friends screen: `{ "data": { "code": "SPLIX-ALEX-482" } }`. Created on the first request (`SPLIX-` + the first four letters of their name + three digits, unique) and permanent afterwards.

### `POST /auth/forgot-password`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required, valid email |

Emails a 6-digit reset code. Answers `200 { "sent": true }` for unknown emails too.

### `POST /auth/verify-otp`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required |
| `otp` | string | required, exactly 6 digits |

**Response:** a `resetToken` valid for 15 minutes, good for one password change.

### `POST /auth/reset-password`

| Body field | Type | Rules |
| --- | --- | --- |
| `resetToken` | string | required (from verify-otp) |
| `password` | string | required, min 8 chars |

Changes the password, burns the code (the token can't be used twice), marks the email verified and sends a "password changed" security email.

### Emails

All emails share one branded template (`backend/src/emails/layout.js`) and are sent through Resend when `RESEND_API_KEY` is set; without it they are printed to the server console. `node scripts/preview-emails.js` renders them to `backend/email-previews/` for checking the design.

---

## Home

### `GET /home`

Everything the dashboard needs in one call, aggregated across all of the caller's groups.

**Response `200`:**

```json
{
  "data": {
    "balance": { "net": 35.5, "youOwe": 84.5, "owedToYou": 120, "groupCount": 3 },
    "upcomingTrips": [
      { "_id", "name", "location", "startDate", "endDate", "memberCount", "status": "not-started" | "active" }
    ],
    "tasks": [{ "_id", "title", "priority", "dueAt", "status", "group": { "_id", "name", "groupType" } }],
    "recentExpenses": [
      { "_id", "description", "category", "amount", "date", "group", "paidBy": { "_id", "name" },
        "paidByMe", "yourShare", "owedToYou", "settled" }
    ]
  }
}
```

- `balance` counts **unsettled** splits only: `youOwe` is the caller's shares on expenses others paid, `owedToYou` is others' shares on expenses the caller paid, `net = owedToYou - youOwe`. `groupCount` is the number of groups with anything outstanding.
- `upcomingTrips`: trip groups with a `startDate` that have not ended (`endDate = startDate + totalDays - 1`), soonest first.
- `tasks`: the 5 most recently created tasks. `recentExpenses`: the 5 most recent expenses; `settled` means nothing is outstanding for the caller on that expense.

---

## Trips

### `GET /trips`

Every trip group the caller belongs to, with what the Trips tab needs, in a fixed number of queries.

**Response `200`:** `{ "data": { "trips": [ ... ], "stats": { ... } } }`

Each trip:

| Field | Meaning |
| --- | --- |
| `status` | `ongoing`, `upcoming`, `unscheduled` (no start date) or `past` |
| `daysUntil` | calendar days until it starts (upcoming only) |
| `dayNumber` | which day of the trip today is (ongoing only; the last day still counts as ongoing) |
| `startDate`, `endDate`, `totalDays`, `location` | `endDate = startDate + totalDays - 1` |
| `members` | populated `{ _id, name, email }` |
| `spend` | `{ total, yourShare, expenseCount }`; `yourShare` is the sum of the caller's own splits |
| `tasks` | `{ total, done }` |
| `nextTask` | the open task with the earliest due date, `{ _id, title, dueAt }`, or `null` |
| `counts` | `{ itineraryDays, stays, photos }`; cancelled stays are not counted |

Sorted: ongoing, then upcoming (soonest first), then unscheduled, then past (most recent first).

`stats`: `{ totalTrips, upcoming, daysTravelled, places, totalSpent }`. `daysTravelled` counts finished trips in full plus the elapsed days of ongoing ones; `places` is distinct locations; `totalSpent` is the caller's share across all trips.

---

## Groups

All group routes require auth, and all `/:groupId/...` routes require the caller to be a **member** of that group.

### `POST /groups`

Create a group. The creator becomes `createdBy` (the group admin) and the first member. An 8-char `inviteCode` is generated automatically.

| Body field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 2–80 chars |
| `description` | string | optional, ≤300 chars |
| `groupType` | enum | `trip` \| `home` \| `couple` \| `event` \| `other` (default `trip`) |
| `totalDays` | int | optional, 1–365 (trip length) |
| `startDate` | date | optional, trip groups only — first day of the trip |
| `location` | string | optional, ≤120 chars, trip groups only (e.g. `"Bali, Indonesia"`) |

**Response `201`:** `{ "data": { "group": { "_id", "name", "groupType", "totalDays", "createdBy", "members": [{ "_id", "name", "email" }], "inviteCode", ... } } }`

### `GET /groups`

List all groups the caller belongs to (members populated with `name`, `email`).

### `POST /groups/join`

| Body field | Type | Rules |
| --- | --- | --- |
| `inviteCode` | string | required, 4–16 chars |

Adds the caller to the matching group and returns it.

### `GET /groups/:groupId`

Group detail with populated members. `createdBy` is the admin's user id.

### `POST /groups/:groupId/leave`

Leave the group. Fails (`400`) if the caller still has unsettled shares, owed either way.

Optional body: `{ "newAdminId": "<userId>" }`. When the **admin** leaves, the role is handed over: automatically if only one other member remains, otherwise `newAdminId` is required and must be a remaining member. Posts "X left the group" (and "Y is now the group admin") in the chat, notifies the other members, and emits the realtime event `group:member-left` `{ groupId, userId }`.

Group responses carry `admin` (the current admin's user id; falls back to `createdBy` for older groups) and `mutedBy` (ids of members who muted the group).

### `DELETE /groups/:groupId/members/:memberId`

**Admin only** (`403` otherwise). Removes a member. Fails (`400`) if that member has unsettled shares, or if the admin targets themselves. Posts "X was removed by Y" in the chat, notifies the removed person directly and the remaining members, and emits `group:member-left`.

### `PUT /groups/:groupId/mute`

Body: `{ "muted": true | false }`. Mutes or unmutes the group for the caller only. While muted, the caller gets no device pushes from this group; in-app notifications are still recorded. Response: `{ "data": { "muted": true } }`

### `GET /groups/:groupId/balances`

Net money position per member plus suggested settlements.

```json
{
  "data": {
    "balances": [{ "user": { "_id", "name", "email" }, "net": 42.5 }],
    "settlements": [{ "from": { ... }, "to": { ... }, "amount": 42.5 }]
  }
}
```

`net > 0` → member is owed money; `net < 0` → member owes.

### `GET /groups/:groupId/contributions`

Fairness dashboard combining money (paid vs fair share) and effort (tasks done vs assigned).

```json
{
  "data": {
    "totalExpenses": 1240.5,
    "tasksTotal": 12,
    "tasksCompleted": 8,
    "score": 86,
    "statusLabel": "Mostly Fair",
    "headline": "...",
    "adjustmentsNeeded": 35.0,
    "me": { "expensesPaid": 400, "fairShare": 310, ... },
    "members": [
      {
        "user": { "_id", "name", "email" },
        "expensesPaid": 400,
        "fairShare": 310,
        "tasksAssigned": 4,
        "tasksDone": 3,
        "badge": "contributed-extra"
      }
    ]
  }
}
```

`badge` is one of `contributed-extra` | `balanced` | `owes-effort` | `owes-balance`.

---

## Expenses

### `GET /groups/:groupId/expenses`

List the group's expenses (`paidBy` and `splits[].user` populated). Response: `{ "data": { "expenses": [ ... ] } }`

### `POST /groups/:groupId/expenses`

| Body field | Type | Rules |
| --- | --- | --- |
| `description` | string | required, ≤200 chars |
| `amount` | number | required, > 0 |
| `paidBy` | ObjectId | required, must be a group member |
| `splitType` | enum | `equal` (default) \| `exact` |
| `participants` | ObjectId[] | for `equal`: who shares the cost (defaults to all members) |
| `splits` | `[{ user, amount }]` | for `exact`: per-member amounts (must sum to `amount`) |
| `category` | enum | `general` \| `food` \| `stay` \| `travel` \| `fun` \| `shopping` \| `transport` \| `housing` \| `entertainment` \| `utilities` \| `other` |
| `date` | date | optional |

**Response `201`:** `{ "data": { "expense": { ..., "splits": [{ "user", "amount", "settled" }] } } }`

### `GET /expenses/:expenseId`

Single expense detail.

### `POST /expenses/:expenseId/settle`

Mark a split as settled.

| Body field | Type | Rules |
| --- | --- | --- |
| `userId` | ObjectId | optional — omit to settle **your own** share; the payer can pass another member's id |

### `DELETE /expenses/:expenseId`

Delete an expense.

---

## Chat messages

### `GET /groups/:groupId/messages`

Response: `{ "data": { "messages": [ ... ] } }`. Messages include system/activity entries (`type`) as well as plain `text` messages, with `sender` populated.

### `POST /groups/:groupId/messages`

| Body field | Type | Rules |
| --- | --- | --- |
| `text` | string | required, 1–2000 chars |

---

## Direct messages (one-to-one chat)

A conversation is between exactly two people. A new one can only be started with someone you share a group with; once it exists it stays open even if that group is left. Only the two participants can read or post (`403` otherwise).

### `POST /conversations`

Body: `{ "userId": "<the other person>" }`. Returns the existing conversation with that person, or creates it on first contact. Response: `{ "data": { "conversation": { "_id", "participants": [{ "_id", "name", "email", "lastSeenAt" }], "lastMessageText", "lastMessageAt" } } }`

### `GET /conversations`

The caller's conversations that have at least one message, newest activity first.

### `GET /conversations/:conversationId`

One conversation with participants populated (used when opening a chat from a push).

### `GET /conversations/:conversationId/messages`

Query: `limit` (default 50, max 200), `before` (ISO date, pages back through history), `after` (ISO date, catch-up after a reconnect). Returned oldest-first. Each message: `{ "_id", "conversation", "sender": { "_id", "name" }, "text", "createdAt" }`.

### `POST /conversations/:conversationId/messages`

Body: `{ "text": "..." }` (1–2000 chars, trimmed). The message is pushed live to both participants, and the recipient gets a device push (`data: { type: "dm", conversationId }`) unless they have that chat open.

### Realtime events (socket.io)

| Event | Direction | Payload |
| --- | --- | --- |
| `dm:new` | server → both participants | `{ conversationId, message }` |
| `dm:typing` | client → server | `{ conversationId, typing }` — relayed to the other person as `{ conversationId, userId, name, typing }` |
| `dm:open` / `dm:close` | client → server | `{ conversationId }` / none — marks the chat as on screen, which suppresses pushes for it |
| `dm:presence` | client → server (ack) | `{ conversationId }` → `{ online, lastSeenAt }` for the other person |

---

## Tasks

### `GET /groups/:groupId/tasks` · `POST /groups/:groupId/tasks`

Create body:

| Body field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, ≤200 chars |
| `notes` | string | optional, ≤500 |
| `priority` | enum | `high` \| `med` (default) \| `low` |
| `assignees` | ObjectId[] | optional |
| `dueAt` | date \| null | optional |
| `subtasks` | `[{ title, done }]` | optional, ≤20 |
| `links` | `[{ title?, url }]` | optional, ≤10 |
| `source` | `{ message?, user?, text?, at? }` | optional — the chat message the task was created from |

### `GET /tasks/:taskId`

Single task detail.

### `PATCH /tasks/:taskId`

Any subset of the create fields plus `status`: `open` \| `done`.

### `DELETE /tasks/:taskId`

---

## Reminders

### `GET /groups/:groupId/reminders` · `POST /groups/:groupId/reminders`

Create body:

| Body field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, ≤200 |
| `subtitle` | string | optional, ≤200 |
| `remindAt` | date | required |
| `scope` | enum | `group` (default) \| `me` |
| `repeatWeekly` | boolean | optional |
| `icon` | string | optional Ionicons name, ≤40 |
| `task` | ObjectId | optional linked task |

### `PATCH /reminders/:reminderId`

Any subset of the create fields plus `enabled`: boolean (toggle on/off).

### `DELETE /reminders/:reminderId`

---

## Itinerary

An itinerary is a list of **days**, each holding an ordered list of **activities**.

### `GET /groups/:groupId/itinerary` · `POST /groups/:groupId/itinerary`

Create-day body:

| Body field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, ≤120 |
| `date` | date \| null | optional |
| `dayNumber` | int | optional, 1–365 (auto-increments if omitted) |
| `activities` | Activity[] | optional |

Activity object: `{ time?, endTime?, title (required, ≤200), location?, icon?, note? }`

### `PATCH /itinerary-days/:dayId`

Update `title`, `date`, and/or replace `activities`.

### `DELETE /itinerary-days/:dayId`

### `POST /itinerary-days/:dayId/activities`

Body: one Activity object (see above). Appends it to the day.

### `DELETE /itinerary-days/:dayId/activities/:activityId`

---

## Photos (gallery)

### `GET /groups/:groupId/photos`

Response: `{ "data": { "photos": [ ... ] } }`

### `POST /groups/:groupId/photos`

Add a photo entry by URL or as an emoji/colour placeholder tile.

| Body field | Type | Rules |
| --- | --- | --- |
| `imageUrl` | string (URL) | optional |
| `emoji` | string | optional, ≤8 |
| `color` | string | optional, hex `#rrggbb` |
| `caption` | string | optional, ≤200 |
| `taggedMembers` | ObjectId[] | optional |

### `POST /groups/:groupId/photos/upload`

`multipart/form-data` with a single file field named **`photo`** (and an optional `caption`). Only `image/*` mimetypes, max **10 MB** (`413` above that); the caller must be a group member.

The image is sent to the configured storage provider and never written to the API server's disk. With the three `CLOUDINARY_*` variables set that is Cloudinary (stored as JPG under `splix/groups/<groupId>/`); without them it falls back to the local `uploads/` folder, for development only.

The created photo carries:

| Field | Meaning |
| --- | --- |
| `imageUrl` | the full-size image: what the app downloads to the phone and shows full-screen |
| `thumbUrl` | a small square (400px) for the gallery grid |
| `storageProvider` | `cloudinary` or `local` |

Absolute URLs (`https://…`) are used as-is; relative ones (`/uploads/…`) are relative to the API origin.

### `DELETE /photos/:photoId`

Uploader only. Also deletes the image from the storage provider.

---

## Attractions

### `GET /groups/:groupId/attractions` · `POST /groups/:groupId/attractions`

Create body:

| Body field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, ≤120 |
| `category` | string | optional, ≤60 |
| `rating` | number | optional, 0–5 |
| `distanceKm` | number | optional, 0–10000 |
| `emoji` | string | optional, ≤8 |

### `POST /attractions/:attractionId/toggle-save`

Toggles the caller in/out of the attraction's `savedBy` list (bookmark).

### `PATCH /attractions/:attractionId`

Any subset of the create fields (`rating`/`distanceKm` also accept `null` to clear).

### `DELETE /attractions/:attractionId`

---

## Stays

### `GET /groups/:groupId/stays` · `POST /groups/:groupId/stays`

Create body:

| Body field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, ≤120 |
| `stars` | int | optional, 1–5 |
| `status` | enum | `pending` \| `confirmed` \| `cancelled` |
| `checkIn` | date | required |
| `checkOut` | date | required |
| `guests` | int | optional, 1–50 |
| `pricePerNight` | number | required, ≥ 0 |
| `amenities` | string[] | optional, ≤12 items |
| `address` | string | optional, ≤200 |
| `emoji` | string | optional, ≤8 |

### `PATCH /stays/:stayId`

Any subset of the create fields (used e.g. to cycle `status`).

### `DELETE /stays/:stayId`

---

## Notifications

Every in-app notification is also delivered as a device push (via Expo's push service) to each recipient's registered devices. The push carries `data: { type, groupId, entityId? }` — `entityId` is the expense/task id for `expense` and `task` notifications.

### `POST /notifications/push-token`

Register this device for pushes. Body: `{ "token": "ExponentPushToken[...]" }`. The token is moved off any other account it was registered to.

### `DELETE /notifications/push-token`

Unregister this device (call on logout). Body: `{ "token": "ExponentPushToken[...]" }`.

### `GET /notifications`

The caller's notifications, newest first. Each carries `type`, `group` and, for `expense` and `task` notifications, `entityId` (the expense/task id), which is what the app uses to decide where a tap leads.

### `PATCH /notifications/read-all`

Mark all as read.

### `PATCH /notifications/:notificationId/read`

Mark one as read.

### `DELETE /notifications/:notificationId`

Delete one.

### `DELETE /notifications`

Clear all.

---

## Support

### `POST /support/contact`

Create a support ticket.

| Body field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 2–80 |
| `email` | string | required, valid email, ≤120 |
| `subject` | string | required, 2–150 |
| `message` | string | required, 5–2000 |

**Response `201`:** `{ "data": { "ticket": { ... } } }`

---

## Quick-start example

```bash
# Register
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex K.","email":"alex@example.com","password":"secret123"}'

# Create a group (use the token from the previous response)
curl -X POST http://localhost:4000/api/v1/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Tokyo Getaway","groupType":"trip","totalDays":8}'

# Add an equal-split expense
curl -X POST http://localhost:4000/api/v1/groups/<groupId>/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"description":"Airbnb","amount":320,"paidBy":"<userId>","splitType":"equal","category":"stay"}'
```
