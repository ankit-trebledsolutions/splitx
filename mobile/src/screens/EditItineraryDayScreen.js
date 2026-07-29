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
import { updateItineraryDay, deleteItineraryDay } from '../api/itinerary.api';
import { dark, radius, spacing } from '../theme';

const dateLabel = (date) =>
  date ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Set date';

// Full-screen editor for one itinerary day, per the edit-itinerary mockup.
const EditItineraryDayScreen = ({ route, navigation }) => {
  const { day, groupName } = route.params;

  const [title, setTitle] = useState(day.title);
  const [date, setDate] = useState(day.date ? new Date(day.date) : null);
  const [activities, setActivities] = useState(
    (day.activities ?? []).map((a) => ({ time: a.time ?? '', title: a.title }))
  );
  const [saving, setSaving] = useState(false);

  const shiftDate = (days) => {
    setDate((prev) => {
      const next = prev ? new Date(prev) : new Date();
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const setActivity = (index, patch) => {
    setActivities((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const removeActivity = (index) => {
    setActivities((prev) => prev.filter((_, i) => i !== index));
  };

  const addActivity = () => {
    setActivities((prev) => [...prev, { time: '', title: '' }]);
  };

  const save = async () => {
    if (title.trim().length < 1) {
      Alert.alert('Day name required', 'Give this day a name before saving.');
      return;
    }
    const cleaned = activities
      .map((a) => ({ time: a.time.trim(), title: a.title.trim() }))
      .filter((a) => a.title.length > 0);

    setSaving(true);
    try {
      await updateItineraryDay(day._id, {
        title: title.trim(),
        date: date ? date.toISOString() : null,
        activities: cleaned,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save day', err.message);
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={navigation.goBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Day Details</Text>
          <TouchableOpacity
            style={styles.saveChip}
            activeOpacity={0.85}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveChipText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contextRow}>
            <View style={styles.dayChip}>
              <Text style={styles.dayChipText}>DAY {day.dayNumber}</Text>
            </View>
            <Text style={styles.contextText} numberOfLines={1}>
              {groupName ? `${groupName} Itinerary` : 'Trip Itinerary'}
            </Text>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>DAY NAME</Text>
              <View style={styles.fieldBox}>
                <TextInput
                  style={styles.fieldInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Arrival Day"
                  placeholderTextColor={dark.textMuted}
                />
                <Ionicons name="pencil" size={13} color={dark.accentBlue} />
              </View>
            </View>

            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>DATE</Text>
              <View style={styles.fieldBox}>
                <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={styles.hitSlop}>
                  <Ionicons name="chevron-back" size={14} color={dark.textMuted} />
                </TouchableOpacity>
                <Text style={styles.dateText}>{dateLabel(date)}</Text>
                <TouchableOpacity onPress={() => shiftDate(1)} hitSlop={styles.hitSlop}>
                  <Ionicons name="chevron-forward" size={14} color={dark.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.scheduleHeader}>
            <Text style={styles.fieldLabel}>ACTIVITIES SCHEDULE</Text>
            <Text style={styles.reorderHint}>Edit time & title</Text>
          </View>

          {activities.map((activity, index) => (
            /* eslint-disable-next-line react/no-array-index-key */
            <View key={index} style={styles.activityRow}>
              <Ionicons name="reorder-three-outline" size={18} color={dark.textMuted} />

              <View style={styles.timeBox}>
                <TextInput
                  style={styles.timeInput}
                  value={activity.time}
                  onChangeText={(text) => setActivity(index, { time: text })}
                  placeholder="10:30 AM"
                  placeholderTextColor={dark.textMuted}
                />
              </View>

              <View style={styles.titleBox}>
                <TextInput
                  style={styles.titleInput}
                  value={activity.title}
                  onChangeText={(text) => setActivity(index, { title: text })}
                  placeholder="What's happening?"
                  placeholderTextColor={dark.textMuted}
                />
              </View>

              <TouchableOpacity
                style={styles.deleteButton}
                activeOpacity={0.8}
                onPress={() => removeActivity(index)}
              >
                <Ionicons name="trash-outline" size={14} color="#F87171" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addActivity} activeOpacity={0.8} onPress={addActivity}>
            <Ionicons name="add" size={16} color={dark.accentGreen} />
            <Text style={styles.addActivityText}>Add New Activity</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteDay}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert('Delete day', `Delete Day ${day.dayNumber} · ${title}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteItineraryDay(day._id);
                      navigation.goBack();
                    } catch (err) {
                      Alert.alert('Could not delete day', err.message);
                    }
                  },
                },
              ])
            }
          >
            <Ionicons name="trash-outline" size={15} color="#F87171" />
            <Text style={styles.deleteDayText}>Delete this day</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: dark.text,
    fontSize: 18,
    fontWeight: '800',
    marginLeft: spacing.md,
  },
  saveChip: {
    backgroundColor: dark.accentGreen,
    borderRadius: 16,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  saveChipText: { color: '#04121C', fontSize: 13, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  dayChip: {
    backgroundColor: 'rgba(23,230,149,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(23,230,149,0.4)',
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  dayChipText: { color: dark.accentGreen, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  contextText: { color: dark.textMuted, fontSize: 12, flex: 1 },

  fieldRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  fieldColumn: { flex: 1 },
  fieldLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    minHeight: 44,
  },
  fieldInput: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600', paddingVertical: 8 },
  dateText: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },

  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  reorderHint: { color: dark.accentBlue, fontSize: 11, fontWeight: '600' },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  timeBox: {
    width: 92,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  timeInput: {
    color: dark.accentGreen,
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 10,
    textAlign: 'center',
  },
  titleBox: {
    flex: 1,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
  },
  titleInput: { color: dark.text, fontSize: 13, fontWeight: '600', paddingVertical: 10 },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(23,230,149,0.45)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  addActivityText: { color: dark.accentGreen, fontSize: 13, fontWeight: '700' },

  deleteDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  deleteDayText: { color: '#F87171', fontSize: 13, fontWeight: '700' },
});

export default EditItineraryDayScreen;
