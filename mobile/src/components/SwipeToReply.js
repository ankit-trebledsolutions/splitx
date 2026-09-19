import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark } from '../theme';

// How far the row follows the finger, and how far it must go to count.
const MAX_PULL = 84;
const TRIGGER_AT = 56;

/**
 * Drag a chat row to the right to reply to it, WhatsApp-style: the row follows
 * the finger a short way, a reply arrow fades in behind it, and letting go past
 * the threshold fires `onReply` while the row springs back. Built on
 * PanResponder like SwipeableRow (the project doesn't ship
 * react-native-gesture-handler).
 */
const SwipeToReply = ({ children, onReply, enabled = true }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  // The responder is created once, so it reads the latest props through a ref.
  const latest = useRef({ onReply, enabled });
  latest.current = { onReply, enabled };

  const settle = () =>
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();

  // Claim only clear rightward drags, so taps, long-presses and the list's
  // vertical scrolling keep working.
  const isSwipe = (_evt, gesture) =>
    latest.current.enabled && gesture.dx > 14 && gesture.dx > Math.abs(gesture.dy) * 2;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: isSwipe,
      // Capture as well: the bubble under the finger is itself touchable and
      // would otherwise hold on to a drag that starts on it.
      onMoveShouldSetPanResponderCapture: isSwipe,
      onPanResponderMove: (_evt, gesture) =>
        translateX.setValue(Math.min(MAX_PULL, Math.max(0, gesture.dx))),
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx >= TRIGGER_AT) latest.current.onReply?.();
        settle();
      },
      // Don't hand a drag in progress to the list half-way through.
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: settle,
    })
  ).current;

  const arrow = {
    opacity: translateX.interpolate({ inputRange: [0, TRIGGER_AT], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      {
        scale: translateX.interpolate({
          inputRange: [0, TRIGGER_AT],
          outputRange: [0.5, 1],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  return (
    <View>
      <Animated.View style={[styles.arrow, arrow]} pointerEvents="none">
        <Ionicons name="arrow-undo" size={15} color={dark.text} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  arrow: {
    position: 'absolute',
    left: 4,
    top: '50%',
    marginTop: -22,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SwipeToReply;
