import { useCallback, useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../api/places.api';

// Fewer letters match half the hotels in a state: not worth asking.
const MIN_LENGTH = 2;
// How long typing must pause before the server is asked.
const PAUSE_MS = 350;

/**
 * The name search on one tab of one group: what was typed, and what the
 * server found for it. The server is asked after a pause in typing, from two
 * letters on, once per distinct name: answers are kept while the group screen
 * is open and forgotten when the destination changes. An answer that arrives
 * for an older query is dropped.
 *
 *   query / setQuery / clear
 *   active:  enough is typed to search; the results panel is showing
 *   status:  'idle' | 'loading' | 'ready' | 'error'
 *   data:    the server's answer (see searchPlaces in api/places.api.js)
 *   error:   { code, message } while status is 'error'
 *   retry:   ask again for the current query
 */
const usePlaceSearch = ({ groupId, type, enabled, destination }) => {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const answers = useRef(new Map());
  const ticket = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A new destination means new answers.
  useEffect(() => {
    answers.current.clear();
  }, [groupId, destination]);

  const trimmed = query.trim();
  const active = Boolean(enabled && groupId) && trimmed.length >= MIN_LENGTH;

  const ask = useCallback(
    async (name) => {
      const mine = ++ticket.current;
      try {
        const data = await searchPlaces(groupId, type, name);
        if (!mounted.current || mine !== ticket.current) return;
        answers.current.set(name.toLowerCase(), data);
        setState({ status: 'ready', data, error: null });
      } catch (err) {
        if (!mounted.current || mine !== ticket.current) return;
        setState({ status: 'error', data: null, error: { code: err.code, message: err.message } });
      }
    },
    [groupId, type]
  );

  useEffect(() => {
    // Anything still on its way is for an older query.
    ticket.current += 1;
    if (!active) {
      setState({ status: 'idle', data: null, error: null });
      return undefined;
    }
    const known = answers.current.get(trimmed.toLowerCase());
    if (known) {
      setState({ status: 'ready', data: known, error: null });
      return undefined;
    }
    setState({ status: 'loading', data: null, error: null });
    const timer = setTimeout(() => ask(trimmed), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [active, trimmed, ask]);

  const clear = useCallback(() => setQuery(''), []);
  const retry = useCallback(() => {
    if (!active) return;
    setState({ status: 'loading', data: null, error: null });
    ask(trimmed);
  }, [active, trimmed, ask]);

  return { query, setQuery, clear, active, retry, ...state };
};

export default usePlaceSearch;
