import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import { addItineraryActivity } from '../api/itinerary.api';
import { dark, radius, spacing } from '../theme';

const dayDateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'No date set';

// Full-screen "Add Activity" form, per the add-new-activity mockup. Opened
// from Edit Day Details → "+ Add New Activity".
const AddActivityScreen = ({ route, navigation }) => {
  const { day } = route.params;

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('10:30 AM');
  const [endTime, setEndTime] = useState('12:00 PM');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Give the activity a name');
      return;
    }
    setSaving(true);
    try {
      await addItineraryActivity(day._id, {
        title: name.trim(),
        location: location.trim() || undefined,
        time: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        note: notes.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not add activity', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DarkScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={navigation.goBack} activeOpacity={0.7} hitSlop={styles.hitSlop}>
            <Ionicons name="arrow-back" size={22} color={dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Activity</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>ACTIVITY NAME</Text>
          <View style={[styles.fieldBox, error ? styles.fieldBoxError : null]}>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError('');
              }}
              placeholder="e.g. Shibuya Sky Observation Deck"
              placeholderTextColor={dark.textMuted}
            />
            <Ionicons name="pencil" size={13} color={dark.accentBlue} />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>LOCATION</Text>
          <View style={styles.fieldBox}>
            <Ionicons name="location-outline" size={15} color={dark.accentGreen} />
            <TextInput
              style={styles.fieldInput}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. 2-24-12 Shibuya, Tokyo, 150-6145"
              placeholderTextColor={dark.textMuted}
            />
          </View>

          <Text style={styles.label}>DATE</Text>
          <View style={styles.fieldBox}>
            <Ionicons name="calendar-outline" size={15} color={dark.textMuted} />
            <Text style={styles.dateText}>{dayDateLabel(day.date)}</Text>
            <Text style={styles.dayChipText}>DAY {day.dayNumber}</Text>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeColumn}>
              <Text style={styles.label}>START TIME</Text>
              <View style={styles.fieldBox}>
                <Ionicons name="time-outline" size={15} color={dark.accentGreen} />
                <TextInput
                  style={[styles.fieldInput, styles.startTimeInput]}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="10:30 AM"
                  placeholderTextColor={dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.timeColumn}>
              <Text style={styles.label}>END TIME</Text>
              <View style={styles.fieldBox}>
                <Ionicons name="time-outline" size={15} color={dark.textMuted} />
                <TextInput
                  style={styles.fieldInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="12:00 PM"
                  placeholderTextColor={dark.textMuted}
                />
              </View>
            </View>
          </View>

          <Text style={styles.label}>NOTES / DESCRIPTION (OPTIONAL)</Text>
          <View style={[styles.fieldBox, styles.notesBox]}>
            <TextInput
              style={[styles.fieldInput, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Remember to reserve the slot exactly 30 days prior. Tickets sell out in minutes!"
              placeholderTextColor={dark.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <GradientButton title="Add Activity" onPress={submit} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { color: dark.text, fontSize: 20, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  label: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldBoxError: { borderColor: '#F87171' },
  fieldInput: {
    flex: 1,
    color: dark.text,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 12,
  },
  errorText: { color: '#F87171', fontSize: 11, marginTop: spacing.xs },

  dateText: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600' },
  dayChipText: { color: dark.accentGreen, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  timeRow: { flexDirection: 'row', gap: spacing.sm },
  timeColumn: { flex: 1 },
  startTimeInput: { color: dark.accentGreen },

  notesBox: { alignItems: 'flex-start', paddingVertical: spacing.xs },
  notesInput: { minHeight: 92, fontWeight: '400', lineHeight: 20 },

  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
});

export default AddActivityScreen;
