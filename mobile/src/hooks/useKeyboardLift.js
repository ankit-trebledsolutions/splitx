import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Android-only replacement for KeyboardAvoidingView, for screens with a bar
 * pinned to the bottom (the chat composer).
 *
 * The app runs edge-to-edge, so the system does not resize the window for the
 * keyboard. KeyboardAvoidingView handles the keyboard opening, but on close
 * Android reports the keyboard ending at the top of the navigation area rather
 * than the screen bottom, which leaves a strip of padding behind. Here the
 * lift is measured on open and reset to exactly zero on close.
 *
 * The keyboard's top edge comes in screen coordinates, and the container is
 * measured in the same ones: `measure`'s page position, from the top of the
 * app's root view, which edge-to-edge is the top of the screen. (Its layout
 * position is relative to its parent, and measureInWindow starts below the
 * status bar on Android; with either, the composer came up short by the height
 * of everything above that point, and the bottom of the input, where the line
 * being typed is, sat behind the keyboard's suggestion strip.)
 *
 * Usage: put `ref` on the container and add `lift` as its paddingBottom.
 * Returns 0 on iOS, where KeyboardAvoidingView behaves.
 */
const useKeyboardLift = () => {
  const ref = useRef(null);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      ref.current?.measure((x, y, width, height, pageX, pageY) => {
        setLift(Math.max(Math.round(pageY + height - keyboardTop), 0));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { lift, ref };
};

export default useKeyboardLift;
