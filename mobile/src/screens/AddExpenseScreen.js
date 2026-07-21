import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { createExpense } from '../api/groups.api';
import { useAuth } from '../context/AuthContext';
import TextField from '../components/TextField';
import Button from '../components/Button';
import { colors, radius, spacing } from '../theme';

const AddExpenseScreen = ({ route, navigation }) => {
  const { groupId, members } = route.params;
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(user?._id);
  const [participants, setParticipants] = useState(members.map((m) => m._id));
  const [loading, setLoading] = useState(false);

  const toggleParticipant = (id) => {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    const value = parseFloat(amount);
    if (!description.trim()) {
      Alert.alert('Missing description', 'What was this expense for?');
      return;
    }
    if (!value || value <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than 0.');
      return;
    }
    if (participants.length === 0) {
      Alert.alert('No participants', 'Select at least one person to split with.');
      return;
    }
    setLoading(true);
    try {
      await createExpense(groupId, {
        description: description.trim(),
        amount: value,
        paidBy,
        splitType: 'equal',
        participants,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save expense', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Dinner, cab, groceries..."
      />
      <TextField
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.sectionTitle}>Paid by</Text>
      <View style={styles.chipsRow}>
        {members.map((m) => (
          <TouchableOpacity
            key={m._id}
            style={[styles.chip, paidBy === m._id && styles.chipActive]}
            onPress={() => setPaidBy(m._id)}
          >
            <Text style={[styles.chipText, paidBy === m._id && styles.chipTextActive]}>
              {m._id === user?._id ? 'You' : m.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Split equally between</Text>
      <View style={styles.chipsRow}>
        {members.map((m) => {
          const selected = participants.includes(m._id);
          return (
            <TouchableOpacity
              key={m._id}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => toggleParticipant(m._id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {m._id === user?._id ? 'You' : m.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button title="Save expense" onPress={handleSave} loading={loading} style={styles.save} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  save: { marginTop: spacing.lg },
});

export default AddExpenseScreen;
