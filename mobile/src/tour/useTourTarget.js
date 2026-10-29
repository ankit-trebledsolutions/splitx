import { useEffect, useRef } from 'react';
import { useTour } from './TourProvider';

/**
 * Makes a view a thing the tour can point at.
 *
 *   const fabRef = useTourTarget('groups-fab', { enabled: isFocused });
 *   <TouchableOpacity ref={fabRef} ...>
 *
 * The overlay asks for the view's position on screen when its step comes up,
 * so the spotlight follows the real control wherever layout puts it. Pass
 * `enabled: false` while the screen is covered by another one: the target
 * then steps out of the registry and the tour waits for it to come back.
 *
 * `prepare` runs before measuring, for a control that first has to be scrolled
 * into view. For a shape that is not one view (a run of tabs), register with
 * `useTour().registerTarget` and supply your own `measure`.
 */
export const measureView = (node) =>
  new Promise((resolve) => {
    if (!node?.measure) {
      resolve(null);
      return;
    }
    node.measure((x, y, width, height, pageX, pageY) => {
      // Unmounted or not laid out yet: nothing to point at.
      if (!width || !height) resolve(null);
      else resolve({ x: pageX, y: pageY, width, height });
    });
  });

const useTourTarget = (name, { enabled = true, prepare } = {}) => {
  const { registerTarget } = useTour();
  const ref = useRef(null);
  // Kept on a ref so a new `prepare` function on every render does not
  // re-register the target (which would make the overlay re-measure).
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;

  useEffect(() => {
    if (!name || !enabled) return undefined;
    return registerTarget(name, {
      measure: () => measureView(ref.current),
      prepare: () => prepareRef.current?.(),
    });
  }, [name, enabled, registerTarget]);

  return ref;
};

export default useTourTarget;
