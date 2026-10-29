import client from './client';

// { balance, upcomingTrips, tasks, recentExpenses } for the dashboard.
export const fetchHome = async () => {
  const { data } = await client.get('/home');
  return data.data;
};
