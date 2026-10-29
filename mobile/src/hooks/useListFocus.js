import { useCallback, useEffect, useRef, useState } from 'react';

// How long the item a chat card led to stays marked.
const HIGHLIGHT_MS = 2000;
// Where the item comes to rest: near the top, not under the tab bar.
const VIEW_POSITION = 0.05;

/**
 * For a tab a chat card can point into (Stays, Attractions). When `focusId`
 * names one of `items`, the list scrolls to it and marks it for a moment, and
 * `onDone` is called so the parent can clear the request: the same card can
 * then be tapped again later. Until the item is in `items` nothing happens
 * (the parent is fetching it).
 *
 * Spread `listProps` onto the FlatList and compare `highlightId` per row.
 */
const useListFocus = ({ items, focusId, onDone }) => {
  const listRef = useRef(null);
  const [highlightId, setHighlightId] = useState(null);
  const scrollTimer = useRef(null);
  const highlightTimer = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(
    () => () => {
      clearTimeout(scrollTimer.current);
      clearTimeout(highlightTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!focusId) return;
    const index = items.findIndex((item) => item._id === focusId);
    if (index < 0) return;
    // The tab has usually only just been drawn: give the list a moment first.
    // Timers live in refs so the parent clearing `focusId` cannot cancel them.
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(
      () => listRef.current?.scrollToIndex({ index, viewPosition: VIEW_POSITION, animated: true }),
      80
    );
    setHighlightId(focusId);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    doneRef.current?.();
  }, [focusId, items]);

  // Rows vary in height, so one far down may not be measured yet: jump close
  // to it, then scroll properly once it has been drawn.
  const onScrollToIndexFailed = useCallback(({ index, averageItemLength }) => {
    listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
    setTimeout(
      () => listRef.current?.scrollToIndex({ index, viewPosition: VIEW_POSITION, animated: true }),
      150
    );
  }, []);

  return { highlightId, listProps: { ref: listRef, onScrollToIndexFailed } };
};

export default useListFocus;
