import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  AppState,
  Linking,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from './GradientButton';
import AppAlert from './AppAlert';
import { fetchAppRelease } from '../api/app.api';
import { APP_VERSION, setUpdateRequiredHandler } from '../api/client';
import { radius, spacing, useStyles, useTheme } from '../theme';

/**
 * Force update. Every build of the app has a number that goes up with each
 * release, the client sends it with every request, and an owner can set the
 * lowest build the server still lets in (admin panel > General Settings >
 * App Updates). A build below it is answered 426 APP_UPDATE_REQUIRED to
 * everything it asks, and this screen is shown over the whole app, with no
 * way to close it: the only button opens the download link the server sent
 * (the APK for now, the store page once Splix is listed).
 *
 * The screen comes up two ways. The quick one: the client's interceptor
 * announces the first 426 it sees. The early one: on launch and whenever the
 * app returns to the foreground, the server is asked outright, so the screen
 * is up before anything is tapped, and goes away again on its own if the
 * owner lowers the bar. Offline, neither can happen, and the app opens as
 * usual on what it has saved.
 *
 * A build that is allowed in but not the newest is told once per newer build,
 * with an ordinary alert it can wave away.
 *
 * <UpdateWallHost /> is mounted once at the app root, outside the navigator
 * and the auth provider: a build that is too old is too old on the sign-in
 * screen as well.
 */

// The newest build people were already told about, so the "update available"
// note is shown once per new build, not on every open.
const OFFERED_KEY = 'splix.updateOffered';

const openLink = (url) => {
  if (!url) return;
  Linking.openURL(url).catch(() =>
    AppAlert.alert("Couldn't open the link", `Open it in your browser instead:\n${url}`)
  );
};

const offerOnce = async (verdict) => {
  try {
    const offered = Number(await AsyncStorage.getItem(OFFERED_KEY)) || 0;
    if (offered >= verdict.latestBuild) return;
    await AsyncStorage.setItem(OFFERED_KEY, String(verdict.latestBuild));
  } catch {
    // Could not remember it: better told twice than never.
  }
  if (!verdict.downloadUrl) return;
  const label = verdict.latestVersion ? `Splix ${verdict.latestVersion}` : 'A newer version of Splix';
  AppAlert.alert(
    'Update available',
    `${label} is ready. You can keep using this version for now.`,
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Update', onPress: () => openLink(verdict.downloadUrl) },
    ]
  );
};

export const UpdateWallHost = () => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // What the server said, while an update is required; null otherwise.
  const [release, setRelease] = useState(null);

  const check = useCallback(async () => {
    let verdict;
    try {
      verdict = await fetchAppRelease();
    } catch {
      // Offline, or a server from before this. The interceptor still catches
      // a refusal the moment one comes.
      return;
    }
    if (verdict.updateRequired) {
      setRelease(verdict);
      return;
    }
    // Allowed in, or allowed in again: an owner may have lowered the bar
    // while the screen was up.
    setRelease(null);
    if (verdict.updateAvailable) offerOnce(verdict);
  }, []);

  useEffect(() => {
    setUpdateRequiredHandler((details) => setRelease((current) => current ?? details));
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      setUpdateRequiredHandler(null);
      subscription.remove();
    };
  }, [check]);

  if (!release) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.badge}>
            <Ionicons name="cloud-download-outline" size={36} color={theme.accentGreen} />
          </View>
          <Text style={styles.title}>Update Splix</Text>
          <Text style={styles.subtitle}>
            This version of Splix is no longer supported. Install the latest version to keep using
            it.
          </Text>

          <View style={styles.versions}>
            <View style={styles.version}>
              <Text style={styles.versionLabel}>YOU HAVE</Text>
              <Text style={styles.versionValue}>{APP_VERSION || `build ${release.build}`}</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={theme.textMuted} />
            <View style={styles.version}>
              <Text style={styles.versionLabel}>LATEST</Text>
              <Text style={[styles.versionValue, { color: theme.accentGreen }]}>
                {release.latestVersion || `build ${release.latestBuild || release.minBuild}`}
              </Text>
            </View>
          </View>

          {release.notes ? (
            <View style={styles.notes}>
              <Text style={styles.notesTitle}>WHAT’S NEW</Text>
              <Text style={styles.notesText}>{release.notes}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {release.downloadUrl ? (
            <GradientButton title="Update now" onPress={() => openLink(release.downloadUrl)} />
          ) : (
            <Text style={styles.footnote}>Ask the Splix team for the latest version.</Text>
          )}
          <Text style={styles.footnote}>
            Your groups, expenses and photos are kept. Once the new version is installed, open
            Splix again.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: spacing.lg,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    badge: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: 'rgba(0,196,208,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(0,196,208,0.30)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: theme.text,
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    versions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      alignSelf: 'stretch',
    },
    version: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    versionLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    versionValue: { color: theme.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
    notes: {
      alignSelf: 'stretch',
      marginTop: spacing.lg,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    notesTitle: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      marginBottom: spacing.xs + 2,
    },
    notesText: { color: theme.textSoft, fontSize: 14, lineHeight: 20 },
    footer: { gap: spacing.md },
    footnote: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
  });
