# Splix

Split expenses, not friendships. A full-stack expense-splitting and group
trip-planning app:

- **`backend/`** — Node.js + Express + MongoDB (Mongoose) REST API
- **`mobile/`** — React Native (Expo SDK 54) app

## Project structure

```
splitx/
├── API.md                 # full REST API documentation
├── backend/
│   ├── uploads/           # uploaded gallery photos (served at /uploads)
│   └── src/
│       ├── config/        # env + database connection
│       ├── models/        # User, Group, Expense, Task, Reminder, Message,
│       │                  # ItineraryDay, Photo, Attraction, Stay,
│       │                  # Notification, SupportMessage
│       ├── services/      # business logic (auth, groups, expenses, balances,
│       │                  # contributions)
│       ├── controllers/   # request/response handling
│       ├── routes/        # route definitions + zod validation
│       ├── middleware/    # auth (JWT), validation, upload (multer), errors
│       ├── utils/         # ApiError, asyncHandler
│       ├── app.js         # express app assembly
│       └── server.js      # entrypoint
└── mobile/
    ├── index.js           # app entry (registerRootComponent)
    ├── modules/
    │   └── splix-alarm/   # native Android module: reminders that ring as alarms
    └── src/
        ├── api/           # axios client + endpoint wrappers per resource
        ├── components/    # Avatar, GradientButton, DarkScreen, sheets, ...
        ├── context/       # AuthContext (JWT session)
        ├── navigation/    # RootNavigator (auth vs app stacks) + MainTabs
        ├── screens/       # auth flow, Home, My Groups, group chat & tabs
        │   │              # (chat/expenses/tasks/reminders/itinerary/gallery/
        │   │              # attractions/stays), Group Info, Member Profile,
        │   │              # Contributions, Expense/Task detail, Profile, ...
        │   └── group/     # tab components for the group chat screen
        ├── theme/         # dark palette, spacing, radii
        └── utils/         # formatting, presence, task detection helpers
```

## Prerequisites

- Node.js ≥ 18
- MongoDB running locally or a MongoDB Atlas URI
- **Expo Go on your phone — its version must match the project's Expo SDK.**
  The project is on **SDK 54**, so you need Expo Go 54.x (Expo Go supports
  exactly one SDK per version; a mismatch shows "Project is incompatible with
  this version of Expo Go"). APKs for specific SDKs: https://expo.dev/go
- Or an iOS simulator / Android emulator

## Running the backend

```bash
cd backend
cp .env.example .env   # then edit JWT_SECRET / MONGODB_URI
npm install
npm run dev            # starts on http://localhost:4000
```

Health check: `GET http://localhost:4000/api/v1/health`

## Running the mobile app

```bash
cd mobile
npm install
npm start              # starts the Expo dev server (Metro on port 8081)
```

Scan the QR code with Expo Go, or press `a` / `i` for an emulator/simulator.

> **Physical device?** Edit `mobile/src/api/client.js` and set `HOST` to your
> machine's LAN IP so the phone can reach the API (phone and computer must be
> on the same Wi-Fi). Android emulators use `10.0.2.2` automatically; iOS
> simulator uses `localhost`.

### Troubleshooting

- **"Port 8081 is being used by another process"** — an old Metro server is
  still running. Kill it (`Get-NetTCPConnection -LocalPort 8081` → stop that
  PID on Windows) and start again.
- **Bundling errors after changing dependencies or SDK** (e.g.
  `dependencies is not iterable`) — clear Metro's cache:
  `npx expo start -c`.
- **Upgrading the Expo SDK** (e.g. when Expo Go updates):
  `npx expo install expo@^<version> --fix` aligns every dependency.

## App features

- **Auth** — register/login (JWT), forgot-password with OTP reset flow
- **Groups** — create (trip/home/couple/event), join via invite code,
  member list with admin (creator) badge
- **Group chat** — messages with polling, smart task detection from chat,
  activity entries for expenses/tasks/reminders
- **Expenses** — equal or exact splits, categories, settle per member,
  balances with suggested settlements
- **Contributions** — fairness dashboard (money + task effort per member)
- **Tasks** — priorities, assignees, due dates, subtasks, links, reminders
- **Reminders** — ring like an alarm at the exact time, with the app closed or
  the phone locked (Android; see "Reminder alarms" below). For the whole
  group, just me, or personal with no group; weekly repeat; each member can
  switch a reminder off for themselves. All of mine are listed on the
  Reminders screen (alarm icon on Home)
- **Itinerary** — days with timed activities
- **Gallery** — photo upload (multipart, 15 MB max) or emoji/colour tiles
- **Attractions & Stays** — shortlists with bookmarks, stay status tracking
- **Group Info screen** — tap the group name in the chat header: members with
  presence, view contributions, add friends, preferences (mute/leave)
- **Member profile** — tap another member: contact info, groups in common,
  send message / remove from group (UI)
- **Notifications** — list, mark read, clear

## Reminder alarms

A reminder is handed to the phone's own alarm clock, so it rings on the minute
with Splix closed, the phone locked, or no signal. The pieces:

- `mobile/modules/splix-alarm/` — the native Android module (Kotlin): sets the
  alarm, rings on the alarm volume, shows the alarm screen over the lock
  screen, and puts alarms back after a restart. It is native code, so a change
  there (or a first install of it) needs a new build: `npx expo run:android`,
  or a new EAS build for testers. Expo Go cannot run it.
- `mobile/src/utils/reminderAlarms.js` — keeps the phone's alarms in step with
  the server. `reminderPushTask.js` does the same from a silent push while the
  app is closed.
- `backend/src/services/reminderSync.service.js` sends those silent pushes;
  `reminderSweep.service.js` is the server's backup at reminder time.

**The sound** is one file: `mobile/modules/splix-alarm/android/src/main/res/raw/splix_alarm.ogg`.
Replace it (same name; `.ogg`, `.mp3` or `.wav`) and rebuild to change the tone.
Every alarm carries a sound name, so more files can sit next to it and be
chosen per alarm later (`AlarmSound.kt`, and `DEFAULT_SOUND` in
`reminderAlarms.js`).

**Android permissions.** Notifications, "Alarms & reminders" (off by default
from Android 14; without it a reminder is an ordinary notification that can be
late), and on Android 14+ full-screen notifications. The app explains and asks
for them the first time it is opened and again whenever a reminder is saved
while one is missing.

**The server's backup timer** is on by default only when `NODE_ENV=production`
(`REMINDER_SWEEP=on|off` overrides). Keep it off on a machine whose `.env`
points at the live database.

**iOS** has no alarm clock an app may use below iOS 26, so there a reminder is
an ordinary scheduled notification.

Checks: `npm test` and `npm run smoke:reminders` in `backend/` (the second
needs a local MongoDB and uses a throwaway database), and
`gradlew :splix-alarm:testDebugUnitTest` in `mobile/android/` for the alarm
time rules in the native module.

## API

Full endpoint documentation lives in **[API.md](API.md)**.

Base URL: `http://localhost:4000/api/v1` — all non-auth routes require
`Authorization: Bearer <token>`. Resource groups:

| Area | Endpoints |
| --- | --- |
| Auth | `/auth/register`, `/auth/login`, `/auth/me`, `/auth/forgot-password`, `/auth/verify-otp`, `/auth/reset-password` |
| Groups | `/groups`, `/groups/join`, `/groups/:id`, `/groups/:id/leave`, `/groups/:id/balances`, `/groups/:id/contributions` |
| Per-group resources | `/groups/:id/expenses`, `/messages`, `/tasks`, `/reminders`, `/itinerary`, `/photos` (+ `/photos/upload`), `/attractions`, `/stays` |
| Items | `/expenses/:id` (+ `/settle`), `/tasks/:id`, `/reminders/:id`, `/itinerary-days/:id` (+ `/activities`), `/photos/:id`, `/attractions/:id` (+ `/toggle-save`), `/stays/:id` |
| Other | `/notifications` (read/clear), `/support/contact`, `/health` |
