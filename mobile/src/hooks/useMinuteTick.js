import { useEffect, useState } from 'react';

// The current time, refreshed once a minute, for screens whose look depends on
// the clock (the itinerary roadmap moves its marker as stops go by).
const useMinuteTick = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

export default useMinuteTick;
