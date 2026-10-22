import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TourProvider>
          <SocketProvider>
            <StreamVideoProvider>
              <ActiveCallProvider>
                <NavigationContainer>
                  <StatusBar style="dark" />
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
}
