import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchItineraryGeneration } from '../api/itinerary.api';

const POLL_MS = 6000;
// How long after this phone first saw a job running it stops waiting for it.
const GIVE_UP_MS = 5 * 60 * 1000;
const DONE_BANNER_MS = 6000;
// A failure older than this is history, not news.
const RECENT_MS = 10 * 60 * 1000;
const TIMEOUT_MESSAGE = 'That took longer than expected. Try again.';

// Failed jobs whose banner the user closed. Kept outside the hook so the
// banner stays closed when the group screen is opened again.
const dismissedJobs = new Set();

const idOf = (value) => String(value?._id ?? value ?? '');

// Both times come from the server, so a wrong phone clock can't skew the answer.
const isRecent = (finishedAt, serverNow) =>
  Boolean(finishedAt && serverNow) && new Date(serverNow) - new Date(finishedAt) < RECENT_MS;

// What one screen has witnessed, by job id: the jobs it saw running, when it
// first saw each (phone clock), and the ones it has already finished up for.
const newWitness = () => ({ running: new Set(), firstSeenAt: {}, doneFired: new Set() });

const noteRunning = (witness, jobId) => {
  witness.running.add(jobId);
  if (!witness.firstSeenAt[jobId]) witness.firstSeenAt[jobId] = Date.now();
};

/**
 * The state of AI itinerary planning for one group, kept live.
 *
 * News of a job reaches the phone three ways, because none is reliable alone:
 * the `itinerary:ai` socket event (dropped while the app is in the
 * background), a status poll while a job runs, and `refresh()`, which the
 * group screen calls on focus and this hook calls on reconnect. All three go
 * through applyJob, which only ever moves a job forward, so a slow poll
 * answer can't put back a banner the socket already cleared.
 *
 *   configured: undefined until the server answers, then true / false, or null
 *               when the server has no such route (an older backend).
 *   settling:   the job is done and onDone (the days refetch) is still running.
 *   banner:     'none' | 'running' | 'done' | 'failed'
 */
const useAiItinerary = ({
  groupId,
  socket,
  connected,
  currentUserId,
  seedJob,
  onItineraryChanged,
  onDone,
}) => {
  const witness = useRef(null);
  if (!witness.current) witness.current = newWitness();

  // The seed is the job the preferences screen just started. It is read once:
  // a later navigate() to this screen overwrites the route params, and the
  // job must not vanish with them.
  const [job, setJob] = useState(() => {
    if (seedJob?.status === 'running') noteRunning(witness.current, seedJob._id);
    return seedJob ?? null;
  });
  const [configured, setConfigured] = useState(undefined);
  const [settling, setSettling] = useState(false);
  // The done / failed banner currently earned: { jobId, kind }.
  const [notice, setNotice] = useState(null);

  const jobRef = useRef(job);
  const noticeTimer = useRef(null);
  const mounted = useRef(true);
  // Handlers are long-lived, so they read the latest props through a ref.
  const latest = useRef({});
  latest.current = { groupId, currentUserId, onItineraryChanged, onDone };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(noticeTimer.current);
    };
  }, []);

  // The mounted screen is reused when another group is opened on top of it, so
  // a new group id starts from nothing. A new seed never resets anything.
  const stateFor = useRef(groupId);
  useEffect(() => {
    if (stateFor.current === groupId) return;
    stateFor.current = groupId;
    jobRef.current = null;
    clearTimeout(noticeTimer.current);
    setJob(null);
    setConfigured(undefined);
    setSettling(false);
    setNotice(null);
  }, [groupId]);

  const settle = useCallback(async () => {
    const forGroup = latest.current.groupId;
    setSettling(true);
    try {
      await latest.current.onDone?.();
    } catch {
      // The next focus reloads the days.
    } finally {
      if (mounted.current && latest.current.groupId === forGroup) setSettling(false);
    }
  }, []);

  // source: 'socket' | 'fetch' | 'local'. serverNow only comes with a fetch.
  const applyJob = useCallback(
    (next, source, serverNow) => {
      if (!next?._id || !mounted.current) return;
      const current = jobRef.current;
      if (current?._id === next._id) {
        if (current.status === next.status) return;
        // A finished job never goes back to running.
        if (current.status !== 'running' && next.status === 'running') return;
      } else if (current && new Date(next.startedAt) < new Date(current.startedAt)) {
        return; // news about an older job
      }

      jobRef.current = next;
      setJob(next);
      clearTimeout(noticeTimer.current);

      if (next.status === 'running') {
        noteRunning(witness.current, next._id);
        setNotice(null);
        return;
      }

      const watched = witness.current.running.has(next._id);

      if (next.status === 'done') {
        if (witness.current.doneFired.has(next._id)) return;
        witness.current.doneFired.add(next._id);
        if (!watched) {
          // It finished while nobody here was watching, so there is nothing to
          // announce. If that was moments ago the days loaded alongside may
          // predate it; fetch them once more.
          setNotice(null);
          if (isRecent(next.finishedAt, serverNow)) latest.current.onItineraryChanged?.();
          return;
        }
        // Set together with the job above, so the screen never renders a
        // moment that is neither running nor settling while it has no days.
        setNotice({ jobId: next._id, kind: 'done' });
        noticeTimer.current = setTimeout(() => setNotice(null), DONE_BANNER_MS);
        settle();
        return;
      }

      // Failed. Only the requester is told, and only when it is news: it came
      // over the socket, this screen watched the job run, or the server says it
      // just happened. For everyone else the running banner simply goes away.
      const mine = idOf(next.requestedBy) === String(latest.current.currentUserId);
      const news = source === 'socket' || watched || isRecent(next.finishedAt, serverNow);
      setNotice(
        mine && news && !dismissedJobs.has(next._id) ? { jobId: next._id, kind: 'failed' } : null
      );
    },
    [settle]
  );

  // Never rejects: a failed status check just leaves things as they were.
  const refresh = useCallback(async () => {
    try {
      const data = await fetchItineraryGeneration(groupId);
      if (!mounted.current || latest.current.groupId !== groupId) return;
      setConfigured(typeof data.configured === 'boolean' ? data.configured : null);
      applyJob(data.job, 'fetch', data.serverNow);
    } catch (err) {
      if (!mounted.current || latest.current.groupId !== groupId) return;
      if (err.status === 404) setConfigured(null);
    }
  }, [groupId, applyJob]);

  useEffect(() => {
    if (!socket || !connected) return undefined;

    const onAi = ({ groupId: g, job: next } = {}) => {
      if (String(g) === String(groupId)) applyJob(next, 'socket');
    };
    // Any itinerary write by anyone, AI or by hand. The event carries no days.
    const onUpdated = ({ groupId: g } = {}) => {
      if (String(g) === String(groupId)) latest.current.onItineraryChanged?.();
    };

    socket.on('itinerary:ai', onAi);
    socket.on('itinerary:updated', onUpdated);
    return () => {
      socket.off('itinerary:ai', onAi);
      socket.off('itinerary:updated', onUpdated);
    };
  }, [socket, connected, groupId, applyJob]);

  // A reconnect, which includes coming back from the background, may have
  // missed the event that ended the job.
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) refresh();
    wasConnected.current = connected;
  }, [connected, refresh]);

  // Safety net while a job runs. The cut-off is measured on this phone's clock
  // from the moment it first saw the job, and never against the server's
  // `startedAt`: a phone running ten minutes fast would time out at once.
  const runningId = job?.status === 'running' ? job._id : null;
  useEffect(() => {
    if (!runningId) return undefined;
    const timer = setInterval(async () => {
      if (Date.now() - witness.current.firstSeenAt[runningId] < GIVE_UP_MS) {
        refresh();
        return;
      }
      clearInterval(timer);
      // One last look, then stop waiting. A later event can still finish the job.
      await refresh();
      const current = jobRef.current;
      if (current?._id !== runningId || current.status !== 'running') return;
      applyJob(
        { ...current, status: 'failed', errorCode: 'AI_TIMEOUT', errorMessage: TIMEOUT_MESSAGE },
        'local'
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [runningId, refresh, applyJob]);

  const dismiss = useCallback(() => {
    const current = jobRef.current;
    if (current?.status === 'failed') dismissedJobs.add(current._id);
    clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  const running = job?.status === 'running';
  const isMine = Boolean(job) && idOf(job.requestedBy) === String(currentUserId);
  const banner = running ? 'running' : notice && notice.jobId === job?._id ? notice.kind : 'none';

  return { configured, job, running, settling, isMine, banner, refresh, dismiss };
};

export default useAiItinerary;
