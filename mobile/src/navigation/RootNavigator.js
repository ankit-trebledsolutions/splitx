import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import EnterOtpScreen from '../screens/EnterOtpScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import PasswordChangedScreen from '../screens/PasswordChangedScreen';
import MainTabs from './MainTabs';
import GroupActionScreen from '../screens/GroupActionScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import GroupInviteScreen from '../screens/GroupInviteScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import ExpenseDetailScreen from '../screens/ExpenseDetailScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import EditItineraryDayScreen from '../screens/EditItineraryDayScreen';
import UploadPhotosScreen from '../screens/UploadPhotosScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import ContactUsScreen from '../screens/ContactUsScreen';
import FaqScreen from '../screens/FaqScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';

const Stack = createNativeStackNavigator();

const MIN_SPLASH_MS = 1500;

const RootNavigator = () => {
  const { user, isLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading || !splashDone) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {user ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="GroupAction"
            component={GroupActionScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CreateGroup"
            component={CreateGroupScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="GroupInvite"
            component={GroupInviteScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="GroupChat"
            component={GroupChatScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddExpense"
            component={AddExpenseScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="ExpenseDetail"
            component={ExpenseDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditItineraryDay"
            component={EditItineraryDayScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UploadPhotos"
            component={UploadPhotosScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="TaskDetail"
            component={TaskDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ContactUs"
            component={ContactUsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="Faq" component={FaqScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="PrivacyPolicy"
            component={PrivacyPolicyScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EnterOtp"
            component={EnterOtpScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PasswordChanged"
            component={PasswordChangedScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

export default RootNavigator;
