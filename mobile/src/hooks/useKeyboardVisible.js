import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// True while the on-screen keyboard is up. iOS gets the "will" events so the
// layout moves with the keyboard animation; Android only fires the "did" ones.
const useKeyboardVisible = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
};

export default useKeyboardVisible;
