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

### `POST /auth/register`

| Body field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 2–60 chars |
| `email` | string | required, valid email, unique |
| `password` | string | required, min 8 chars |

**Response `201`:** `{ "data": { "user": { "_id", "name", "email", ... }, "token": "<jwt>" } }`

### `POST /auth/login`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required |
| `password` | string | required |

**Response `200`:** same shape as register.

### `GET /auth/me` 🔒

Returns the authenticated user: `{ "data": { "user": { ... } } }`

### `POST /auth/forgot-password`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required, valid email |

Sends/issues a 6-digit OTP for password reset.

### `POST /auth/verify-otp`

| Body field | Type | Rules |
| --- | --- | --- |
| `email` | string | required |
| `otp` | string | required, exactly 6 digits |

**Response:** includes a short-lived `resetToken` to use in the next step.

### `POST /auth/reset-password`

| Body field | Type | Rules |
| --- | --- | --- |
| `resetToken` | string | required (from verify-otp) |
| `password` | string | required, min 8 chars |

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

Leave the group. Fails if the caller still has unsettled balances.

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

`multipart/form-data` with a single file field named **`photo`**. Only `image/*` mimetypes, max **15 MB** (JPG/PNG/HEIC per the design). The stored file is served at `/uploads/<filename>` and the created photo document references it.

### `DELETE /photos/:photoId`

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

### `GET /notifications`

The caller's notifications, newest first.

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
