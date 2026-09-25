import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// One base query for every feature slice. Previously each *Api.js file built its
// own, with its own hardcoded fallback URL — so changing the API host meant
// editing seven files, and a dropped session went unhandled in all of them.

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Everything the panel calls lives under the admin router. Nothing here should
// ever reach the mobile app's endpoints.
export const ADMIN_BASE = `${API_URL}/api/v1/admin`;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: ADMIN_BASE,
  // The session is an httpOnly cookie the panel cannot read, so the browser has
  // to send it rather than us attaching it by hand.
  credentials: 'include',
  prepareHeaders: (headers) => {
    // Proof to the server that this request came from our own JavaScript: a
    // cross-site form post cannot set a custom header, and a cross-origin fetch
    // that tries triggers a preflight only our origin is allowed to pass. Sent
    // on reads too — the server only enforces it on methods that change state,
    // and one unconditional header beats threading the method through here.
    // See backend/src/middleware/adminAuth.js.
    headers.set('X-Admin-Request', '1');
    return headers;
  },
});

// Session expiry is handled once, here. Without it an expired cookie left the
// user staring at a page whose every panel had quietly failed.
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

export const adminBaseQuery = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    // Not on the sign-in request itself, or a wrong password would look like a
    // dropped session and bounce the user away from the error they need to read.
    const url = typeof args === 'string' ? args : args.url;
    if (!String(url).includes('/auth/login')) onUnauthorized?.();
  }

  return result;
};

// The API answers { success, data: {...} }. Slices care about the payload, so it
// is unwrapped here rather than in every endpoint's transformResponse.
export const unwrap = (response) => response?.data ?? response;

// Errors answer { success: false, message }, which RTK Query nests under
// `.data` — awkward to read at every call site.
export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.data?.message || error?.error || fallback;
