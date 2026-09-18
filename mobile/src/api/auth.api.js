import client from './client';

export const registerRequest = async (payload) => {
  const { data } = await client.post('/auth/register', payload);
  return data.data;
};

// The emailed sign-up code. Success returns { user, token }, like logging in.
export const verifyEmailRequest = async (email, otp) => {
  const { data } = await client.post('/auth/verify-email', { email, otp });
  return data.data;
};

// purpose: 'verify-email' | 'reset-password'
export const resendCodeRequest = async (email, purpose) => {
  const { data } = await client.post('/auth/resend-code', { email, purpose });
  return data.data;
};

export const loginRequest = async (payload) => {
  const { data } = await client.post('/auth/login', payload);
  return data.data;
};

// Exchanges a Google ID token for our own { user, token } — signs up or logs in.
export const googleLoginRequest = async (idToken) => {
  const { data } = await client.post('/auth/google', { idToken });
  return data.data;
};

// The person's own invite code (created on first request), e.g. SPLIX-ALEX-482.
export const fetchInviteCode = async () => {
  const { data } = await client.get('/auth/invite-code');
  return data.data.code;
};

export const meRequest = async () => {
  const { data } = await client.get('/auth/me');
  return data.data;
};

export const forgotPasswordRequest = async (email) => {
  const { data } = await client.post('/auth/forgot-password', { email });
  return data.data;
};

export const verifyOtpRequest = async (email, otp) => {
  const { data } = await client.post('/auth/verify-otp', { email, otp });
  return data.data;
};

export const resetPasswordRequest = async (resetToken, password) => {
  const { data } = await client.post('/auth/reset-password', { resetToken, password });
  return data.data;
};
