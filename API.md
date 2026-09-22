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

Errors the app needs to branch on also carry a machine-readable `code`, and sometimes extra fields next to it (see the tables under Auth and Itinerary).

| Status | Meaning |
| --- | --- |
| 400 | Validation failed (zod/Mongoose) or malformed id |
| 401 | Missing/invalid/expired JWT |
| 403 | Authenticated but not allowed (e.g. not a group member) |
| 404 | Resource or route not found |
| 409 | Duplicate value (e.g. email already registered) |
| 429 | Rate limit exceeded (auth routes: 50 requests / 15 min per IP; AI itinerary planning: see Itinerary) |
| 500 | Server error |
| 503 | A feature that depends on an outside service is not set up or is switched off for now (AI itinerary planning) |

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

### `DELETE /groups/:groupId`

**Admin only** (`403` "Only the group admin can delete this group"). Deletes the group for every member, with everything in it: chat messages, expenses (settled or not), tasks, reminders, itinerary days and AI jobs, gallery photos, attractions, stays, and the notifications about the group. Files behind gallery photos and chat attachments are removed from storage. It cannot be undone, and unsettled balances do not block it; the app warns the admin before calling it.

Response: `{ "success": true, "message": "Group deleted" }`. Afterwards every request for the group answers `404`. Each other member gets a "Group Deleted" notification with no group attached, and the realtime event `group:deleted` `{ groupId, name, deletedBy }` goes to everyone who has the group open so their screens can close.

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

Response: `{ "data": { "messages": [ ... ] } }`. Messages include system/activity entries (`type`) as well as plain `text` messages and `image` / `audio` / `file` messages with an `attachment` (see the upload endpoint below), with `sender` populated.

### `POST /groups/:groupId/messages`

| Body field | Type | Rules |
| --- | --- | --- |
| `text` | string | required, 1–2000 chars |
| `replyTo` | ObjectId | optional; the message being answered. Must be a `text` / `image` / `audio` / `file` message in the same group (`400` otherwise) |

A reply comes back with `replyTo` populated just enough to draw the quote: `{ _id, type, text, sender, attachment: { name, durationMs }, deletedAt }`.

### `DELETE /groups/:groupId/messages/:messageId`

"Delete for everyone". Sender only (`403` otherwise), and only for `text` / `image` / `audio` / `file` messages (`400` for system lines and activity cards).

The message is not removed: it stays in the feed as a placeholder with `deletedAt` set, `text` emptied and `attachment` null, so replies that quote it still resolve. Its file is deleted from storage, unless it is a photo the group gallery still lists. The updated message is returned and pushed to the group over the socket as **`message:deleted`** (`{ message }`).

### `POST /groups/:groupId/messages/upload`

Sends a photo, voice note or document into the chat. `multipart/form-data` with a single file field named **`file`**, any mimetype, max **10 MB** (`413` above that); the caller must be a group member.

| Body field | Type | Rules |
| --- | --- | --- |
| `file` | file | required |
| `text` | string | optional caption, ≤2000 chars |
| `durationMs` | number | optional; length of a voice note, so the app can show it without downloading the audio |
| `replyTo` | ObjectId | optional; as on the text endpoint |

An `image` message is also added to the group gallery (a photo row pointing at the same stored file, with no "added a photo" line or notification). The file is only deleted from storage once both the message and the gallery photo are gone.

The message `type` is taken from the file's mimetype: `image/*` → `image`, `audio/*` → `audio`, anything else → `file`. The file goes to the same storage provider as gallery photos (under `splix/groups/<groupId>/chat/`). The created message is returned and pushed to the group over the socket (`message:new`) like any other, and carries:

| `attachment` field | Meaning |
| --- | --- |
| `url` | the file itself |
| `thumbUrl` | small square preview for `image` messages; equals `url` otherwise |
| `name`, `mimeType`, `size` | as uploaded (`size` in bytes) |
| `durationMs` | voice notes only, `0` otherwise |
| `storageProvider` | `cloudinary` or `local` |

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

An itinerary is a list of **days**, each holding an ordered list of **activities**. A day's `dayNumber` is its position in the trip calendar (day N falls on `startDate + N - 1`), so deleting a day leaves a free number that a later create can fill. Activities are kept sorted by `time`; an activity with an empty or unreadable time sorts last.

Day object: `{ _id, group, dayNumber, title, date, activities: [{ _id, time, endTime, title, location, icon, note }], createdBy: { _id, name, email }, createdAt, updatedAt }`. Days planned by AI are ordinary days created by the member who asked for the plan; nothing marks them as AI.

Every write below (create, update, delete, the activity endpoints, and an AI plan being saved or rolled back) emits the realtime event `itinerary:updated` to the group. While AI is planning a group's itinerary, every write answers `409` with code `AI_GENERATING` ("AI is planning this itinerary. Try again in a moment.").

**Error codes.** Itinerary errors the app needs to branch on carry a `code` next to `message`, and some add extra fields at the top level of the error body:

| `code` | Status | Meaning | Extra fields |
| --- | --- | --- | --- |
| `AI_GENERATING` | 409 | A write was attempted while AI is planning this group's itinerary | |
| `DAY_DELETE_FORBIDDEN` | 403 | Caller is neither the day's creator nor the group admin | |
| `INVALID_TARGET_DAY` | 400 | `targetDayId` does not exist or belongs to another group | |
| `AI_TRIP_ONLY` | 400 | The group is not a trip group | |
| `AI_TRIP_DETAILS_REQUIRED` | 400 | Neither the group nor the request gives a destination and/or a number of days | `missing`: array of `'destination'` \| `'days'` |
| `AI_REPLACE_FORBIDDEN` | 403 | `replace` by someone who is neither the group admin nor the creator of every existing day | |
| `ITINERARY_EXISTS` | 409 | The group already has days and `replace` was not set | `dayCount` |
| `AI_ALREADY_RUNNING` | 409 | A plan is already being made for this group | `job` |
| `AI_LIMIT` | 429 | Daily cap reached (by default 5 per person and 3 per group in any 24 hours) | `retryAfter` (seconds), `scope`: `'user'` \| `'group'` |
| `AI_RATE_LIMITED` | 429 | More than 20 planning requests in 15 minutes from one account | |
| `AI_NOT_CONFIGURED` | 503 | The server has no `OPENAI_API_KEY` | |
| `AI_UNAVAILABLE` | 503 | The planner is switched off for now (a key or billing problem at OpenAI, or the server-wide daily cap) | |

### `GET /groups/:groupId/itinerary` · `POST /groups/:groupId/itinerary`

Create-day body:

| Body field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, ≤120 |
| `date` | date \| null | optional |
| `dayNumber` | int | optional, 1–365. Omitted: one more than the highest existing number. Given: that exact number, which is how the app fills the gap a deleted day left. `409` "Day N already exists" when it is taken |
| `activities` | Activity[] | optional |

Activity object: `{ time?, endTime?, title (required, ≤200), location?, icon?, note? }`

Creating a day also posts "X added Day N · Title to the itinerary" in the group chat and notifies the other members ("Itinerary Updated", push `data: { type: "itinerary", groupId }`).

### `PATCH /itinerary-days/:dayId`

Update `title`, `date`, and/or replace `activities`. Each activity may carry its `_id`: an `_id` that belongs to this day is kept across the save, any other `_id` is ignored and the activity gets a new one. `dayNumber` cannot be changed.

### `DELETE /itinerary-days/:dayId`

The day's creator or the group admin; anyone else gets `403` `DAY_DELETE_FORBIDDEN` ("Only the group admin or the member who added this day can delete it."). The other days keep their numbers.

### `POST /itinerary-days/:dayId/activities`

Body: one Activity object (see above). Appends it to the day.

### `PATCH /itinerary-days/:dayId/activities/:activityId`

Edits one activity in place, and optionally moves it to another day. Any group member.

| Body field | Type | Rules |
| --- | --- | --- |
| `time`, `endTime` | string | optional, ≤20. An empty string clears the field |
| `title` | string | optional, 1–200 |
| `location` | string | optional, ≤200. An empty string clears it |
| `icon` | string | optional Ionicons name, ≤40 |
| `note` | string | optional, ≤300. An empty string clears it |
| `targetDayId` | ObjectId | optional. A day of the same group to move the activity to; it keeps its `_id` |

At least one field is required (`400` "Nothing to update"). Both days are re-sorted by time.

**Response `200`:** `{ "data": { "day": Day, "targetDay": Day | null } }`. `day` is the day named in the URL. `targetDay` is the day now holding the activity after a move, and `null` otherwise.

Errors: `400` `INVALID_TARGET_DAY` ("That day is not part of this itinerary."), `404` "Itinerary day not found", `404` "Activity not found", `409` `AI_GENERATING`.

### `DELETE /itinerary-days/:dayId/activities/:activityId`

### `POST /groups/:groupId/itinerary/generate`

Asks AI (OpenAI) to plan the itinerary of a **trip** group. Any member. Planning takes about a minute, so the request only checks and records the job and answers at once; the outcome arrives through the `itinerary:ai` event, a push, and `GET` on the same path.

The group's own `location`, `startDate` and `totalDays` always win. `destination`, `startDate` and `days` in the body are used only where the group has no value (a `location` shorter than 2 characters counts as none), with one exception: after a run that failed with `AI_BAD_DESTINATION` or `AI_REFUSED`, a `destination` in the body overrides the group's for the next run. Values taken from the body are saved on the group only after a plan has been saved, and without touching the group's `updatedAt`. At most 14 days are planned per run; for a longer trip AI plans the first 14.

| Body field | Type | Rules |
| --- | --- | --- |
| `destination` | string | optional, 2–120 chars, trimmed |
| `startDate` | date \| null | optional |
| `days` | int | optional, 1–14 |
| `groupSize` | int | optional, 1–1000; defaults to the member count. Planned for at most 50 |
| `travellers` | enum | required: `friends` \| `couple` \| `family_kids` \| `with_elders` \| `solo` |
| `interests` | enum[] | required, 1–9 of: `sightseeing` \| `food` \| `nature` \| `adventure` \| `shopping` \| `nightlife` \| `spiritual` \| `history` \| `relaxing` |
| `pace` | enum | required: `relaxed` \| `balanced` \| `packed` |
| `budget` | enum | required: `budget` \| `mid` \| `premium` |
| `transport` | enum | required: `own_car` \| `cab` \| `public_transport` \| `walking` |
| `arrivalTime`, `departureTime` | string \| null | optional, exactly `h:mm AM` or `h:mm PM` (e.g. `9:30 AM`) |
| `food` | enum \| null | optional: `vegetarian` \| `non_veg` \| `vegan` \| `jain` |
| `notes` | string | optional, ≤300: must-do and avoid wishes |
| `dayStart` | enum | `early` \| `normal` (default) \| `late` |
| `accessibility` | enum | `none` (default) \| `limited_walking` \| `wheelchair` |
| `replace` | boolean | default `false`. Needed to plan over existing days. They are deleted only once a valid plan is ready, and they come back if saving it fails |

**Response `202`:** `{ "data": { "job": Job } }`

Job object: `{ _id, group, status: "running" | "done" | "failed", replace, requestedBy: { _id, name }, startedAt, finishedAt, dayCount, errorCode, errorMessage }`. `finishedAt`, `errorCode` and `errorMessage` are `null` until they apply.

Errors: `400` (validation), `AI_TRIP_ONLY`, `AI_TRIP_DETAILS_REQUIRED`, `AI_REPLACE_FORBIDDEN`, `ITINERARY_EXISTS`, `AI_ALREADY_RUNNING`, `AI_LIMIT`, `AI_RATE_LIMITED`, `AI_NOT_CONFIGURED`, `AI_UNAVAILABLE` (see the table above). None of them creates a job or costs anything.

A finished plan posts one chat line ("X planned a N-day itinerary with AI", or "X replanned the itinerary with AI (N days)"), notifies the other members ("Itinerary Ready") and notifies the requester ("Your itinerary is ready"). A failed one notifies only the requester ("Could not create itinerary", with the job's `errorMessage`); `AI_CANCELLED` and `AI_STALE` notify nobody. All of these pushes carry `data: { type: "itinerary", groupId }`. Text written by AI only ever appears in itinerary days, never in chat lines or notifications.

A failed job carries one of these codes, and its `errorMessage` is always the fixed text shown:

| `errorCode` | `errorMessage` |
| --- | --- |
| `AI_UNAVAILABLE` | AI planner is unavailable right now. You can still add days by hand. |
| `AI_BUSY` | The AI planner is busy. Try again in a minute. |
| `AI_TIMEOUT`, `AI_STALE` | That took longer than expected. Try again. |
| `AI_REFUSED` | AI could not plan this trip. Check the destination and your notes, then try again. |
| `AI_BAD_DESTINATION` | AI did not recognise that destination. Correct it and try again. |
| `AI_TRUNCATED` | The plan came out too long. Try a more relaxed pace. |
| `AI_BAD_OUTPUT` | AI returned a plan we could not read. Try again. |
| `AI_CONFLICT` | The itinerary changed while AI was planning. Nothing was replaced. Try again. |
| `AI_CANCELLED` | Planning was cancelled. |
| `AI_FAILED` | Something went wrong while planning. Try again. |

`AI_CANCELLED` means the requester left or was removed from the group, or the group is gone. `AI_STALE` is a job whose server stopped mid-run: it is closed the next time anyone reads or starts a plan for the group, and from 3 minutes after it started it no longer blocks edits.

### `GET /groups/:groupId/itinerary/generate`

The state of AI planning for this group. Any member.

**Response `200`:** `{ "data": { "configured", "job", "lastPrefs", "destinationEditable", "serverNow" } }`

| Field | Meaning |
| --- | --- |
| `configured` | boolean: the server has an OpenAI key. When `false`, `POST` answers `AI_NOT_CONFIGURED` |
| `job` | the group's latest Job of any age, or `null` |
| `lastPrefs` | the body (without `replace`) of the caller's own latest request in this group, or `null`; lets the form reopen the way they left it |
| `destinationEditable` | boolean: a `destination` in the body would be used (the group has none, or the latest job failed with `AI_BAD_DESTINATION` or `AI_REFUSED`) |
| `serverNow` | server time of this response. Judge how old `finishedAt` is against this, never against the phone's clock |

### Realtime events (socket.io)

| Event | Direction | Payload |
| --- | --- | --- |
| `itinerary:ai` | server → the group's members, and the requester directly | `{ groupId, job }`. Sent when a job starts running, is done, or has failed (not for `AI_STALE`). The requester gets it twice, through the group's room and their own, because the creator of a brand-new group is not in its room yet. Merge by `job._id`, and never let a finished job go back to `running` |
| `itinerary:updated` | server → the group's members | `{ groupId }`. The itinerary changed, by hand or by AI. Carries no days: refetch with `GET /groups/:groupId/itinerary` |

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

### `POST /photos/bulk-delete`

Multi-select delete from the gallery.

| Body field | Type | Rules |
| --- | --- | --- |
| `photoIds` | ObjectId[] | required, 1–100 ids |

Same rule as the single delete, applied per photo: only the caller's own uploads are removed (and their images deleted from storage). Ids that belong to someone else, or don't exist, are skipped rather than failing the batch.

Response: `{ "data": { "deletedIds": [ ... ] } }` — the photos that were actually deleted.

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
