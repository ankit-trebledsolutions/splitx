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
- **Reminders** — group or personal scope, weekly repeat, enable/disable
- **Itinerary** — days with timed activities
- **Gallery** — photo upload (multipart, 15 MB max) or emoji/colour tiles
- **Attractions & Stays** — shortlists with bookmarks, stay status tracking
- **Group Info screen** — tap the group name in the chat header: members with
  presence, view contributions, add friends, preferences (mute/leave)
- **Member profile** — tap another member: contact info, groups in common,
  send message / remove from group (UI)
- **Notifications** — list, mark read, clear

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
