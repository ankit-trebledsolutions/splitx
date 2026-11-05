# Expo push security

Splix sends every push through Expo's push service: chat and reminder notifications, the silent pushes that set reminder alarms, and the pushes that ring a phone for a group call. Today Expo accepts a push for any Expo push token from anyone. Someone who gets hold of a person's push token can make that phone ring a fake call or alarm (audit O-7, `SECURITY-AUDIT-2026-11-05.md`).

With **push security** on, Expo sends only requests that carry the project's access token. The backend sends that token when `EXPO_ACCESS_TOKEN` is set (`backend/src/services/push.service.js`). When it is empty, pushes go out exactly as before.

Nothing changes in the app, and the token never goes into it.

## Turn it on

The order matters. With push security on and no token on the server, **every** push fails: calls stop ringing and alarms stop syncing.

1. **Deploy the backend** that includes this change (it reads `EXPO_ACCESS_TOKEN`).
2. **Create an access token** on expo.dev while signed in to the account that owns the project (slug `splity`, project id `dcc7c129-b738-468c-b681-f4b90e08c1a1`). Go to account settings, then **Access tokens**, then create one. Use a **robot** token if the page offers it, named for example `splix-backend-push`. Copy it; it is shown once.
3. **Put it on the server.** On the VPS, in `backend/.env`:
   ```
   EXPO_ACCESS_TOKEN=<the token>
   ```
   Then recreate the API container so it reads the file again (`restart` does not):
   ```bash
   docker compose up -d --force-recreate api
   ```
4. **Check that pushes still arrive**, for example with a chat message from a second account to a phone with the app in the background. Expo accepts the token even while push security is off, so this step is safe.
5. **Switch on push security.** On the same Access tokens page, turn on **Enhanced Security for Push Notifications**. If Expo has moved it, search the project and account settings for that name.
6. **Check again** as in step 4, and also ring a group call to a second phone. The API log must not show `Expo push responded 401`.

If pushes stop after step 5, switch the setting off again (this takes effect at once) and check the token in `backend/.env`.

## Rotating the token

Create a new token, put it in `backend/.env`, recreate the API container, check one push, and then revoke the old token on expo.dev.

## Notes

- Keep the token only in `backend/.env` on the VPS (and your password manager). It is a credential for the Expo account, so never commit it.
- Tests never send real pushes: `backend/testkit/safeEnv.js` blanks `EXPO_ACCESS_TOKEN` and the tests stub `fetch`.
- This document was written without access to the Expo dashboard. The page names come from Expo's documentation and may have moved.
