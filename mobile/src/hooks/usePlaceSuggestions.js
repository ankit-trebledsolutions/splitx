import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPlaceSuggestions } from '../api/places.api';

/**
 * The suggested places for one tab of one group, loaded the first time the
 * tab is opened and kept while the group screen is open, so switching tabs
 * does not ask the server again. Loads again when the destination changes.
 *
 *   status:  'idle' | 'loading' | 'ready' | 'error'
 *   data:    the server's Suggestions answer (see api/places.api.js)
 *   error:   { code, message } while status is 'error'
 *   refreshing: a forced refresh is in flight (the list stays visible)
 */
const usePlaceSuggestions = ({ groupId, type, enabled, destination }) => {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  // Which (group, destination) the current data is for, so a change starts over.
  const loadedFor = useRef(null);
  const mounted = useRef(true);
  const inFlight = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      const ticket = ++inFlight.current;
      const key = `${groupId}|${destination ?? ''}`;
      if (refresh) setRefreshing(true);
      else setState((prev) => ({ ...prev, status: 'loading', error: null }));
      try {
        const data = await fetchPlaceSuggestions(groupId, type, { refresh });
        if (!mounted.current || ticket !== inFlight.current) return;
        loadedFor.current = key;
        setState({ status: 'ready', data, error: null });
      } catch (err) {
        if (!mounted.current || ticket !== inFlight.current) return;
        // A failed refresh keeps what was already shown.
        setState((prev) =>
          refresh && prev.data
            ? prev
            : { status: 'error', data: prev.data, error: { code: err.code, message: err.message } }
        );
      } finally {
        if (mounted.current && ticket === inFlight.current) setRefreshing(false);
      }
    },
    [groupId, type, destination]
  );

  useEffect(() => {
    if (!enabled || !groupId) return;
    const key = `${groupId}|${destination ?? ''}`;
    if (loadedFor.current === key && state.status !== 'idle') return;
    load();
    // `state.status` is read, not reacted to: a load is started by the tab
    // opening or the destination changing, never by its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, groupId, destination, load]);

  const refresh = useCallback(() => load({ refresh: true }), [load]);
  const retry = useCallback(() => load(), [load]);

  return { ...state, refreshing, refresh, retry };
};

export default usePlaceSuggestions;
