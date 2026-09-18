import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Usage: spread `onLayout` on the container and add `lift` as its paddingBottom.
 * Returns 0 on iOS, where KeyboardAvoidingView behaves.
 */
const useKeyboardLift = () => {
  const frame = useRef(null);
  const [lift, setLift] = useState(0);

  const onLayout = useCallback((event) => {
    frame.current = event.nativeEvent.layout;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const box = frame.current;
      if (!box) return;
      setLift(Math.max(box.y + box.height - event.endCoordinates.screenY, 0));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { lift, onLayout };
};

export default useKeyboardLift;
