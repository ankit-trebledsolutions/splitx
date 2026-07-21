import client from './client';

export const registerRequest = async (payload) => {
  const { data } = await client.post('/auth/register', payload);
  return data.data;
};

export const loginRequest = async (payload) => {
  const { data } = await client.post('/auth/login', payload);
  return data.data;
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
