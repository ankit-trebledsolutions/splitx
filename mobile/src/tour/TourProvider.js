import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { buildSteps } from './steps';

/**
 * The guided tour: which chapter is running, which step it is on, and the
 * controls on screen it can point at.
 *
 * Screens register the controls (useTourTarget), start a chapter when its
 * moment comes (Home for the welcome, a group for its tabs), and tell the
 * tour when a highlighted control was tapped. TourOverlay, mounted once at
 * the app root, draws the spotlight and the card.
 *
 * Each chapter is shown once per account on this phone. The flags live in
 * AsyncStorage under the user's id, so a second account on the same phone
 * gets its own tour, and a reinstall shows it again. Profile → App tour
 * clears them.
 */

const TourContext = createContext(null);
// The targets on their own, read only by the overlay: a control registering
// must not re-render every screen that merely uses the tour.
const TourRegistryContext = createContext(null);

const storageKey = (userId) => `splix.tour.${userId}`;

export const TourProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?._id ?? null;

  // Chapters already seen: { welcome: true, group: true }. null until the
  // phone has been asked, so nothing starts on a stale answer.
  const [done, setDone] = useState(null);
  // The running chapter: { chapter, index, steps, context } or null.
  const [active, setActive] = useState(null);

  // name -> { measure, prepare }. A ref, so registering never re-renders the
  // whole app; `registryVersion` tells the overlay something changed.
  const targets = useRef(new Map());
  const [registryVersion, setRegistryVersion] = useState(0);

  useEffect(() => {
    setActive(null);
    setDone(null);
    if (!userId) return undefined;
    let current = true;
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (!current) return;
        let saved = {};
        try {
          saved = JSON.parse(raw) || {};
        } catch {
          saved = {};
        }
        setDone(saved);
      })
      .catch(() => {
        if (current) setDone({});
      });
    return () => {
      current = false;
    };
  }, [userId]);

  const persist = useCallback(
    (next) => {
      if (!userId) return;
      // Best-effort: a failed write only means the tour shows once more.
      AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
    },
    [userId]
  );

  const markDone = useCallback(
    (chapter) => {
      setDone((prev) => {
        const next = { ...(prev ?? {}), [chapter]: true };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const isDone = useCallback((chapter) => done === null || Boolean(done[chapter]), [done]);

  const registerTarget = useCallback((name, entry) => {
    targets.current.set(name, entry);
    setRegistryVersion((v) => v + 1);
    return () => {
      // Only the entry that registered may remove itself: a screen going away
      // must not knock out the same control registered again by a newer one.
      if (targets.current.get(name) === entry) {
        targets.current.delete(name);
        setRegistryVersion((v) => v + 1);
      }
    };
  }, []);

  // Starts a chapter, unless one is already running: two spotlights cannot
  // share a screen, and the second chapter gets its turn on its next trigger.
  const start = useCallback((chapter, context = {}) => {
    const steps = buildSteps(chapter, context);
    if (!steps.length) return;
    setActive((prev) => (prev ? prev : { chapter, index: 0, steps, context }));
  }, []);

  const finish = useCallback(() => {
    setActive((prev) => {
      if (prev) markDone(prev.chapter);
      return null;
    });
  }, [markDone]);

  const next = useCallback(() => {
    setActive((prev) => {
      if (!prev) return null;
      if (prev.index + 1 >= prev.steps.length) {
        markDone(prev.chapter);
        return null;
      }
      return { ...prev, index: prev.index + 1 };
    });
  }, [markDone]);

  // Skipping counts as seen: the person said no, and is not asked again.
  const skip = finish;

  // A screen reporting that a highlighted control was tapped. Only a 'tap'
  // step pointing at that very control moves on; anything else is ignored.
  const notifyTap = useCallback(
    (name) => {
      setActive((prev) => {
        if (!prev) return null;
        const step = prev.steps[prev.index];
        if (step.target !== name || step.advance !== 'tap') return prev;
        if (prev.index + 1 >= prev.steps.length) {
          markDone(prev.chapter);
          return null;
        }
        return { ...prev, index: prev.index + 1 };
      });
    },
    [markDone]
  );

  // Forgets both chapters, so they show again at their next trigger.
  const reset = useCallback(() => {
    setActive(null);
    setDone({});
    persist({});
  }, [persist]);

  const value = useMemo(
    () => ({
      ready: done !== null,
      isDone,
      active: active
        ? {
            chapter: active.chapter,
            index: active.index,
            total: active.steps.length,
            step: active.steps[active.index],
          }
        : null,
      start,
      next,
      skip,
      finish,
      notifyTap,
      reset,
      registerTarget,
    }),
    [done, isDone, active, start, next, skip, finish, notifyTap, reset, registerTarget]
  );

  const registry = useMemo(() => ({ targets, registryVersion }), [registryVersion]);

  return (
    <TourContext.Provider value={value}>
      <TourRegistryContext.Provider value={registry}>{children}</TourRegistryContext.Provider>
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
};

// For the overlay: the registered targets and a counter that moves whenever
// one joins or leaves.
export const useTourRegistry = () => {
  const ctx = useContext(TourRegistryContext);
  if (!ctx) throw new Error('useTourRegistry must be used within TourProvider');
  return ctx;
};
