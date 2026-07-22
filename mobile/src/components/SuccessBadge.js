import React from 'react';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { dark } from '../theme';

// Success check badge: gradient-filled circle with a dark checkmark inside
// a thin outer ring that carries the same blue-to-green gradient.
const SuccessBadge = ({ size = 168 }) => (
  <Svg width={size} height={size} viewBox="0 0 168 168">
    <Defs>
      <LinearGradient id="successGrad" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={dark.accentBlue} />
        <Stop offset="1" stopColor={dark.accentGreen} />
      </LinearGradient>
    </Defs>
    <Circle cx="84" cy="84" r="83" stroke="url(#successGrad)" strokeWidth="1.5" fill="none" />
    <Circle cx="84" cy="84" r="64" fill="url(#successGrad)" />
    <Path
      d="M63 86 L78 101 L107 70"
      stroke="#04121C"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export default SuccessBadge;
