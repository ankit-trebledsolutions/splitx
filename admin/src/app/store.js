import { configureStore } from '@reduxjs/toolkit';
import { authApi } from '@/features/auth/authApi';
import authReducer from '@/features/auth/authSlice';
import { usersApi } from '@/features/users/usersApi';
import usersReducer from '@/features/users/usersSlice';
import { coAdminsApi } from '@/features/co-admins/coAdminsApi';
import adminsReducer from '@/features/co-admins/coAdminsSlice';
import { emailTemplateApi } from '@/features/email-template/emailTemplateApi';
import emailTemplateReducer from '@/features/email-template/emailTemplateSlice';
import { integrationsApi } from '@/features/integrations/integrationsApi';
import { dashboardApi } from '@/features/dashboard/dashboardApi';

// Only the modules that are wired to the ported API are registered. The slices
// for the not-yet-ported modules (category, carousels, the rest of general
// settings) are still in src/features — they are simply not mounted, so nothing
// calls an endpoint that does not exist. Bringing one back is two lines here.

export const store = configureStore({
  reducer: {
    auth: authReducer,
    users: usersReducer,
    admins: adminsReducer,
    emailTemplate: emailTemplateReducer,
    [authApi.reducerPath]: authApi.reducer,
    [usersApi.reducerPath]: usersApi.reducer,
    [coAdminsApi.reducerPath]: coAdminsApi.reducer,
    [emailTemplateApi.reducerPath]: emailTemplateApi.reducer,
    [integrationsApi.reducerPath]: integrationsApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      usersApi.middleware,
      coAdminsApi.middleware,
      emailTemplateApi.middleware,
      integrationsApi.middleware,
      dashboardApi.middleware,
    ),
});
