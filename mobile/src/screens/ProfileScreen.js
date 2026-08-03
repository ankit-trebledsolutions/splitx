import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { profileDefaults, accountSettings, helpSupport } from '../data/profile';
import { dark, radius, spacing } from '../theme';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  // Real account fields win; the rest fall back to the design's placeholder data.
  const profile = { ...profileDefaults, ...(user ?? {}) };

  return (
    <DarkScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity
            style={styles.editChip}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Avatar name={profile.name} size={56} />
          <View style={styles.profileBody}>
            <Text style={styles.profileName}>{profile.name}</Text>
            <Text style={styles.profileHandle}>
              @{profile.username} · {profile.tagline}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={dark.textMuted} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Account Settings</Text>

        <View style={styles.settingsCard}>
          {accountSettings.map((item, index) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.settingRow, index > 0 && styles.settingDivider]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.screen ?? 'EditProfile')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name={item.icon} size={18} color={dark.button} />
              </View>
              <View style={styles.settingBody}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingValue} numberOfLines={1}>
                  {item.value ?? profile[item.valueFrom]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Help & Support</Text>

        <View style={styles.settingsCard}>
          {helpSupport.map((item, index) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.settingRow, index > 0 && styles.settingDivider]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={styles.settingIcon}>
                <Ionicons name={item.icon} size={18} color={dark.button} />
              </View>
              <View style={styles.settingBody}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingValue} numberOfLines={1}>
                  {item.value}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.signOut} onPress={logout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={18} color="#F87171" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  title: { color: dark.text, fontSize: 24, fontWeight: '800' },
  editChip: {
    borderWidth: 1,
    borderColor: dark.accentGreen,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  editText: { color: dark.accentGreen, fontSize: 12, fontWeight: '700' },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  profileBody: { flex: 1, marginLeft: spacing.md },
  profileName: { color: dark.text, fontSize: 18, fontWeight: '700' },
  profileHandle: { color: dark.textMuted, fontSize: 12, marginTop: 3 },

  sectionLabel: {
    color: dark.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  settingsCard: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  settingDivider: { borderTopWidth: 1, borderTopColor: dark.border },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(0,196,208,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingBody: { flex: 1 },
  settingLabel: { color: dark.text, fontSize: 14, fontWeight: '600' },
  settingValue: { color: dark.textMuted, fontSize: 11, marginTop: 2 },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: 'rgba(220,38,38,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.45)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  signOutText: { color: '#F87171', fontSize: 15, fontWeight: '700' },
});

export default ProfileScreen;
