# Splix

Split expenses, not friendships. A full-stack expense-splitting app:

- **`backend/`** — Node.js + Express + MongoDB (Mongoose) REST API
- **`mobile/`** — React Native (Expo) app

## Project structure

```
splity/
├── backend/
│   └── src/
│       ├── config/        # env + database connection
│       ├── models/        # Mongoose schemas (User, Group, Expense)
│       ├── services/      # business logic (auth, groups, expenses, balances)
│       ├── controllers/   # request/response handling
│       ├── routes/        # route definitions + zod validation
│       ├── middleware/    # auth (JWT), validation, error handling
│       ├── utils/         # ApiError, asyncHandler
│       ├── app.js         # express app assembly
│       └── server.js      # entrypoint
└── mobile/
    └── src/
        ├── api/           # axios client + endpoint wrappers
        ├── components/    # Button, TextField, EmptyState, SplixLogo
        ├── context/       # AuthContext (JWT session)
        ├── navigation/    # RootNavigator (auth vs app stacks)
        ├── screens/       # Splash, Login, Register, Groups, GroupDetail, ...
        ├── theme/         # colors, spacing, radii
        └── utils/         # formatting helpers
```

## Prerequisites

- Node.js ≥ 18
- MongoDB running locally (`brew services start mongodb-community`) or a MongoDB Atlas URI
- Expo Go app on your phone, or an iOS simulator / Android emulator

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
npm start              # opens Expo dev tools
```

> **Physical device?** Edit `mobile/src/api/client.js` and set `HOST` to your
> machine's LAN IP so the phone can reach the API. Android emulators use
> `10.0.2.2` automatically; iOS simulator uses `localhost`.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Create account, returns JWT |
| POST | `/api/v1/auth/login` | Login, returns JWT |
| GET | `/api/v1/auth/me` | Current user |
| GET/POST | `/api/v1/groups` | List / create groups |
| POST | `/api/v1/groups/join` | Join via invite code |
| GET | `/api/v1/groups/:id` | Group detail |
| POST | `/api/v1/groups/:id/leave` | Leave group (must be settled) |
| GET | `/api/v1/groups/:id/balances` | Net balances + suggested settlements |
| GET/POST | `/api/v1/groups/:id/expenses` | List / add expenses (equal or exact split) |
| DELETE | `/api/v1/expenses/:id` | Delete an expense |

All non-auth routes require `Authorization: Bearer <token>`.
