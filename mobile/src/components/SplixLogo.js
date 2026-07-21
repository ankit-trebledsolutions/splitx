import React from 'react';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';

// Circular gradient badge with the black double-chevron "split" mark.
const SplixLogo = ({ size = 96 }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      <LinearGradient id="splixBadge" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#4A7DF7" />
        <Stop offset="0.5" stopColor="#2BB8C9" />
        <Stop offset="1" stopColor="#17E695" />
      </LinearGradient>
    </Defs>
    <Circle cx="50" cy="50" r="50" fill="url(#splixBadge)" />
    <Path
      d="M57 30 L36 46 L57 62"
      stroke="#0B0F14"
      strokeWidth="13"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M43 40 L64 56 L43 72"
      stroke="#0B0F14"
      strokeWidth="13"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export default SplixLogo;
