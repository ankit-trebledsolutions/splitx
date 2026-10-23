import React, { useMemo } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme';
import { AuthProvider } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketProvider';
import { StreamVideoProvider } from './src/context/StreamVideoProvider';
import { ActiveCallProvider } from './src/context/ActiveCallProvider';
import { TourProvider } from './src/tour/TourProvider';
import TourOverlay from './src/tour/TourOverlay';
import RootNavigator from './src/navigation/RootNavigator';
import { AppAlertHost } from './src/components/AppAlert';
import { AlarmPermissionHost } from './src/components/AlarmPermissionSheet';
import { NoCreditsHost } from './src/components/NoCreditsSheet';

// Everything below the theme provider. The navigator's own colours follow the
// palette too, so the frame behind a screen during a transition is never the
// wrong shade.
const AppShell = () => {
  const theme = useTheme();
  const navigationTheme = useMemo(() => {
    const base = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.accentGreen,
        background: theme.background,
        card: theme.card,
        text: theme.text,
        border: theme.border,
        notification: theme.accentGreen,
      },
    };
  }, [theme]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TourProvider>
          <SocketProvider>
            <StreamVideoProvider>
              <ActiveCallProvider>
                <NavigationContainer theme={navigationTheme}>
                  <StatusBar style={theme.statusBar} />
                  <RootNavigator />
                  {/* In here, not with the hosts below: its button opens Contact Us. */}
                  <NoCreditsHost />
                </NavigationContainer>
              </ActiveCallProvider>
            </StreamVideoProvider>
          </SocketProvider>
          {/* After the navigator, so the guided tour's spotlight draws over
              every screen and the tab bar. Alerts and sheets below are Modals
              and stay above it. */}
          <TourOverlay />
        </TourProvider>
      </AuthProvider>
      <AlarmPermissionHost />
      <AppAlertHost />
    </SafeAreaProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
