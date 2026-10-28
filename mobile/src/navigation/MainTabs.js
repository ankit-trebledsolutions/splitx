import React, { useEffect } from 'react';
import { Platform, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import MyGroupsScreen from '../screens/MyGroupsScreen';
import TripsScreen from '../screens/TripsScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useTour } from '../tour/TourProvider';
import useTourTarget from '../tour/useTourTarget';
import { useInviteLinks } from '../invites/InviteLinkProvider';
import { useTheme } from '../theme';

const Tab = createBottomTabNavigator();

// Outline glyphs in both states, per the design — only the tint changes.
const ICONS = {
  Home: 'home-outline',
  Groups: 'people-outline',
  Trips: 'briefcase-outline',
  Expenses: 'card-outline',
  Profile: 'person-outline',
};

// Visible height of the bar (icon + label) above the system inset.
const BAR_CONTENT_HEIGHT = 56;
// Padding under the labels on a device with no bottom inset at all.
const BAR_BASE_PADDING = 8;

// The tab bar's button, with a name the guided tour can point at. Stands in
// for the navigator's own button so the tour can measure it and hear its tap;
// the ripple (Android) and press dim (iOS) match the original's feel. Only
// while the tabs are the screen on top: covered by a stack screen, the bar is
// not where the person is looking, so the tour waits for it to come back.
// `to` is the web-only link the navigator passes along; a native Pressable has no use for it.
const TabButton = ({ tourName, tabsFocused, onPress, style, children, to: _to, ...rest }) => {
  const theme = useTheme();
  const { notifyTap } = useTour();
  const ref = useTourTarget(tourName, { enabled: tabsFocused });
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={({ pressed }) => [style, Platform.OS !== 'android' && pressed && { opacity: 0.6 }]}
      android_ripple={{ color: theme.ripple, borderless: true }}
      onPress={(e) => {
        if (tourName) notifyTap(tourName);
        onPress?.(e);
      }}
    >
      {children}
    </Pressable>
  );
};

const MainTabs = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabsFocused = useIsFocused();

  // An invite link that is waiting (tapped before sign-in, or just now) opens
  // the Join screen over the tabs. Done here because this is the first screen
  // that exists in every signed-in state the link can arrive in.
  const stack = useNavigation();
  const { pendingCode, consume } = useInviteLinks();
  useEffect(() => {
    if (!pendingCode) return;
    consume();
    stack.navigate('JoinGroup', { code: pendingCode });
  }, [pendingCode, consume, stack]);
  // The app renders edge-to-edge, so the window extends under the system
  // navigation bar. Android 3-button navigation has a ~48dp bar, gesture
  // navigation ~16-24dp, and iOS the home indicator. A fixed height put the
  // bar underneath the buttons in 3-button mode, so we grow the bar by the
  // live inset instead of hardcoding per platform.
  const bottomInset = Math.max(insets.bottom, BAR_BASE_PADDING);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: BAR_CONTENT_HEIGHT + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name]} size={size - 2} color={color} />
        ),
        tabBarButton: (props) => (
          <TabButton
            {...props}
            tabsFocused={tabsFocused}
            tourName={route.name === 'Groups' ? 'tab-groups' : undefined}
          />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Groups" component={MyGroupsScreen} />
      <Tab.Screen name="Trips" component={TripsScreen} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export default MainTabs;
