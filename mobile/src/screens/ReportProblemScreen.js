import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DarkScreen from '../components/DarkScreen';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import ChoiceChips from '../components/ChoiceChips';
import AppAlert from '../components/AppAlert';
import { createReport, deviceInfo } from '../api/support.api';
import { MAX_ATTACHMENT_BYTES } from '../utils/attachments';
import { MAX_SCREENSHOTS, REPORT_CATEGORIES } from '../data/support';
import { radius, spacing, useStyles, useTheme } from '../theme';

const TILE = 84;

// "Android 14 · Splix 1.0.0", for the line that says what goes along.
const deviceLine = () => {
  const device = deviceInfo();
  const os = device.platform === 'ios' ? 'iOS' : 'Android';
  const osVersion = device.osVersion.replace(/\s*\(API.*\)$/, '');
  return [`${os} ${osVersion}`.trim(), device.appVersion && `Splix ${device.appVersion}`]
    .filter(Boolean)
    .join(' · ');
};

/**
 * Report a Problem: what it is about, a line, the story, and up to three
 * screenshots. The phone's own details go along without being asked for.
 */
const ReportProblemScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const [category, setCategory] = useState(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: undefined }));

  const pickScreenshots = async () => {
    const room = MAX_SCREENSHOTS - screenshots.length;
    if (room <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      AppAlert.alert('Permission needed', 'Allow photo library access to attach screenshots.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (result.canceled) return;

    const picked = result.assets
      .filter((asset) => !asset.fileSize || asset.fileSize <= MAX_ATTACHMENT_BYTES)
      .slice(0, room)
      .map((asset, index) => ({
        id: `${Date.now()}-${index}`,
        uri: asset.uri,
        name: asset.fileName ?? `screenshot-${Date.now()}-${index}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      }));
    if (picked.length < result.assets.length) {
      AppAlert.alert(
        'Some screenshots skipped',
        `Up to ${MAX_SCREENSHOTS} images of ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB each can go with a report.`
      );
    }
    setScreenshots((prev) => [...prev, ...picked]);
  };

  const removeScreenshot = (id) =>
    setScreenshots((prev) => prev.filter((shot) => shot.id !== id));

  const submit = async () => {
    const nextErrors = {};
    if (!category) nextErrors.category = 'Pick what this is about';
    if (subject.trim().length < 3) nextErrors.subject = 'Give it a short title';
    if (message.trim().length < 10) nextErrors.message = 'Tell us a little more about what happened';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSending(true);
    try {
      await createReport({
        category,
        subject: subject.trim(),
        message: message.trim(),
        screenshots,
      });
      setCategory(null);
      setSubject('');
      setMessage('');
      setScreenshots([]);
      AppAlert.alert(
        'Report sent',
        "Thanks. We'll look into it and let you know here in the app.",
        [
          { text: 'See my reports', onPress: () => navigation.replace('MyReports') },
          { text: 'Done', style: 'cancel', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      AppAlert.alert('Could not send', err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <DarkScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={navigation.goBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report a Problem</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('MyReports')}
            activeOpacity={0.7}
            accessibilityLabel="My reports"
          >
            <Ionicons name="time-outline" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Something broken, an idea, or trouble with your account? Tell us and we'll get
            back to you in the app.
          </Text>

          <Text style={styles.sectionLabel}>What is it about?</Text>
          <ChoiceChips
            options={REPORT_CATEGORIES}
            value={category}
            onChange={(value) => {
              setCategory(value);
              clearError('category');
            }}
          />
          {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}

          <Text style={[styles.sectionLabel, styles.sectionGap]}>Title</Text>
          <TextField
            value={subject}
            onChangeText={(text) => {
              setSubject(text);
              clearError('subject');
            }}
            placeholder="What went wrong, in a line"
            maxLength={150}
            error={errors.subject}
          />

          <Text style={styles.sectionLabel}>What happened?</Text>
          <TextField
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              clearError('message');
            }}
            placeholder="What you did, what you expected, and what happened instead..."
            maxLength={2000}
            error={errors.message}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            inputStyle={styles.messageInput}
          />

          <Text style={styles.sectionLabel}>Screenshots (optional)</Text>
          <View style={styles.tiles}>
            {screenshots.map((shot) => (
              <View key={shot.id} style={styles.tile}>
                <Image source={{ uri: shot.uri }} style={styles.tileImage} />
                <TouchableOpacity
                  style={styles.tileRemove}
                  onPress={() => removeScreenshot(shot.id)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Remove screenshot"
                >
                  <Ionicons name="close" size={12} color="#04121C" />
                </TouchableOpacity>
              </View>
            ))}
            {screenshots.length < MAX_SCREENSHOTS && (
              <TouchableOpacity
                style={[styles.tile, styles.tileAdd]}
                onPress={pickScreenshots}
                activeOpacity={0.8}
              >
                <Ionicons name="image-outline" size={22} color={theme.accentGreen} />
                <Text style={styles.tileAddText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.hint}>
            Up to {MAX_SCREENSHOTS}. A picture of the screen helps us find it faster.
          </Text>

          <View style={styles.deviceRow}>
            <Ionicons name="phone-portrait-outline" size={14} color={theme.textMuted} />
            <Text style={styles.deviceText}>
              Sent with {deviceLine()}, so we can try it on the same build.
            </Text>
          </View>

          <GradientButton
            title="Send report"
            onPress={submit}
            loading={sending}
            style={styles.sendButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
  },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  intro: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },

  sectionLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sectionGap: { marginTop: spacing.md },
  error: { color: theme.coral, fontSize: 12, marginTop: spacing.sm },
  messageInput: { minHeight: 130, paddingTop: spacing.md - 2 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tileImage: { width: '100%', height: '100%' },
  tileRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileAdd: {
    borderStyle: 'dashed',
    borderColor: 'rgba(0,196,208,0.45)',
    backgroundColor: 'rgba(0,196,208,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileAddText: { color: theme.accentGreen, fontSize: 12, fontWeight: '700' },
  hint: { color: theme.textMuted, fontSize: 12, marginTop: spacing.sm },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  deviceText: { flex: 1, color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  sendButton: { marginTop: spacing.xs },
});

export default ReportProblemScreen;
