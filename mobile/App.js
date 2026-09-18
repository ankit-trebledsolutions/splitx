import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketProvider';
import { StreamVideoProvider } from './src/context/StreamVideoProvider';
import { ActiveCallProvider } from './src/context/ActiveCallProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { AppAlertHost } from './src/components/AppAlert';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <StreamVideoProvider>
            <ActiveCallProvider>
              <NavigationContainer>
                <StatusBar style="dark" />
                <RootNavigator />
              </NavigationContainer>
            </ActiveCallProvider>
          </StreamVideoProvider>
        </SocketProvider>
      </AuthProvider>
      <AppAlertHost />
    </SafeAreaProvider>
  );
}
