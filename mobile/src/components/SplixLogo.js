import React from 'react';
import { Image } from 'react-native';
import Logo from '../assets/logo.svg';
import { useBranding } from '../branding/BrandingProvider';

// The app's logo: the one uploaded in the admin panel (General Settings >
// Branding) when there is one, otherwise the official Splix mark, straight
// from the design asset. An uploaded logo is drawn whole in the same square,
// never cropped, so a mark that is not round keeps its shape.
const SplixLogo = ({ size = 96 }) => {
  const { logoUrl } = useBranding();
  if (logoUrl) {
    return <Image source={{ uri: logoUrl }} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  return <Logo width={size} height={size} />;
};

export default SplixLogo;
