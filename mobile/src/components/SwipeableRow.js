import React, { useRef } from 'react';
import { Animated, PanResponder, useWindowDimensions } from 'react-native';

/**
 * Swipe-to-dismiss wrapper built on PanResponder (the project doesn't ship
 * react-native-gesture-handler). Drag past ~35% of the screen width in either
 * direction and the row slides out, then `onDismiss` fires.
 */
const SwipeableRow = ({ children, onDismiss, style }) => {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;

  const dismiss = (direction) => {
    Animated.timing(translateX, {
      toValue: direction * width,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onDismiss?.());
  };

  const responder = useRef(
    PanResponder.create({
      // Claim the gesture only for clearly horizontal drags so taps and
      // vertical list scrolling keep working.
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_evt, gesture) => translateX.setValue(gesture.dx),
      onPanResponderRelease: (_evt, gesture) => {
        if (Math.abs(gesture.dx) > width * 0.35 || Math.abs(gesture.vx) > 1.2) {
          dismiss(gesture.dx >= 0 ? 1 : -1);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () =>
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  const opacity = translateX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0.2, 1, 0.2],
  });

  return (
    <Animated.View
      style={[style, { transform: [{ translateX }], opacity }]}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
};

export default SwipeableRow;
