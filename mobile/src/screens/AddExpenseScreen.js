import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import GradientButton from '../components/GradientButton';
import SelectField from '../components/SelectField';
import { useAuth } from '../context/AuthContext';
import { createExpense } from '../api/groups.api';
import { dark, radius, spacing } from '../theme';
import { usd } from '../utils/format';

const CATEGORIES = [
  { label: 'General', value: 'general' },
  { label: 'Food', value: 'food' },
  { label: 'Stay', value: 'stay' },
  { label: 'Travel', value: 'travel' },
  { label: 'Fun', value: 'fun' },
  { label: 'Shopping', value: 'shopping' },
  { label: 'Bills', value: 'utilities' },
  { label: 'Other', value: 'other' },
];

const round2 = (n) => Math.round(n * 100) / 100;

const AddExpenseScreen = ({ route, navigation }) => {
  const { groupId, members = [] } = route.params;
  const { user } = useAuth();

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [paidBy, setPaidBy] = useState(user?._id ?? members[0]?._id);
  const [splitMode, setSplitMode] = useState('equal');
  const [participants, setParticipants] = useState(() => members.map((m) => m._id));
  const [customAmounts, setCustomAmounts] = useState({});
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const amount = Number.parseFloat(amountText) || 0;

  // Equal mode mirrors the server's rule: floor the share, give the remainder
  // to the first participant, so the preview always matches what gets saved.
  const equalShares = useMemo(() => {
    if (!participants.length || !amount) return {};
    const share = Math.floor((amount / participants.length) * 100) / 100;
    const shares = {};
    participants.forEach((id) => {
      shares[id] = share;
    });
    shares[participants[0]] = round2(share + (amount - share * participants.length));
    return shares;
  }, [participants, amount]);

  const customTotal = useMemo(
    () => participants.reduce((sum, id) => sum + (Number.parseFloat(customAmounts[id]) || 0), 0),
    [participants, customAmounts]
  );

  const toggleParticipant = (memberId) => {
    setParticipants((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const submit = async () => {
    if (amount <= 0) {
      Alert.alert('Enter an amount', 'The expense amount must be greater than zero.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Add a description', 'Give the expense a short description.');
      return;
    }
    if (!participants.length) {
      Alert.alert('Pick people', 'Select at least one person to split between.');
      return;
    }
    if (splitMode === 'custom' && Math.abs(customTotal - amount) >= 0.01) {
      Alert.alert(
        'Split does not add up',
        `Custom amounts total ${usd(customTotal)} but the expense is ${usd(amount)}.`
      );
      return;
    }

    setSaving(true);
    try {
      await createExpense(groupId, {
        description: description.trim(),
        amount: round2(amount),
        paidBy,
        category,
        splitType: splitMode === 'equal' ? 'equal' : 'exact',
        ...(splitMode === 'equal'
          ? { participants }
          : {
              splits: participants.map((id) => ({
                user: id,
                amount: round2(Number.parseFloat(customAmounts[id]) || 0),
              })),
            }),
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not add expense', err.message);
    } finally {
      setSaving(false);
    }
  };

  const payer = members.find((m) => m._id === paidBy);

  return (
    <DarkScreen>
      <ScreenHeader title="Add Expense" onBack={navigation.goBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>AMOUNT SPENT</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.25)"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text style={styles.label}>Expense Description</Text>
          <TextInput
            style={styles.field}
            value={description}
            onChangeText={setDescription}
            placeholder="Shibuya Crossing Coffee"
            placeholderTextColor={dark.textMuted}
          />

          <Text style={styles.label}>Category</Text>
          <SelectField value={category} options={CATEGORIES} onChange={setCategory} />

          <Text style={styles.label}>Paid By</Text>
          <TouchableOpacity
            style={styles.payerRow}
            activeOpacity={0.8}
            onPress={() => setPayerPickerOpen((open) => !open)}
          >
            <Avatar name={payer?.name} size={32} solid />
            <Text style={styles.payerName}>
              {payer?.name}
              {payer?._id === user?._id ? ' (You)' : ''}
            </Text>
            <Text style={styles.changeLink}>Change</Text>
            <Ionicons name="chevron-forward" size={14} color={dark.accentBlue} />
          </TouchableOpacity>

          {payerPickerOpen && (
            <View style={styles.payerPicker}>
              {members.map((member) => (
                <TouchableOpacity
                  key={member._id}
                  style={styles.payerOption}
                  activeOpacity={0.7}
                  onPress={() => {
                    setPaidBy(member._id);
                    setPayerPickerOpen(false);
                  }}
                >
                  <Avatar name={member.name} size={26} solid />
                  <Text style={styles.payerOptionText}>{member.name}</Text>
                  {member._id === paidBy && (
                    <Ionicons name="checkmark" size={16} color={dark.accentGreen} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.splitHeader}>
            <Text style={[styles.label, styles.labelInline]}>Split Between</Text>
            <View style={styles.modeToggle}>
              {['equal', 'custom'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeButton, splitMode === mode && styles.modeButtonActive]}
                  onPress={() => setSplitMode(mode)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.modeText, splitMode === mode && styles.modeTextActive]}
                  >
                    {mode === 'equal' ? 'Equal' : 'Custom'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {members.map((member) => {
            const included = participants.includes(member._id);
            return (
              <TouchableOpacity
                key={member._id}
                style={[styles.splitRow, included && styles.splitRowActive]}
                activeOpacity={0.8}
                onPress={() => toggleParticipant(member._id)}
              >
                <View style={[styles.checkbox, included && styles.checkboxOn]}>
                  {included && <Ionicons name="checkmark" size={12} color="#04241A" />}
                </View>
                <Avatar name={member.name} size={28} solid />
                <Text style={styles.splitName} numberOfLines={1}>
                  {member.name}
                  {member._id === user?._id ? ' (You)' : ''}
                </Text>

                {splitMode === 'custom' && included ? (
                  <TextInput
                    style={styles.customInput}
                    value={customAmounts[member._id] ?? ''}
                    onChangeText={(text) =>
                      setCustomAmounts((prev) => ({ ...prev, [member._id]: text }))
                    }
                    placeholder="0.00"
                    placeholderTextColor={dark.textMuted}
                    keyboardType="decimal-pad"
                  />
                ) : (
                  <Text style={[styles.splitAmount, !included && styles.splitAmountOff]}>
                    {usd(included ? equalShares[member._id] ?? 0 : 0)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

          {splitMode === 'custom' && (
            <Text
              style={[
                styles.customTotal,
                Math.abs(customTotal - amount) < 0.01 ? styles.customOk : styles.customBad,
              ]}
            >
              Custom total {usd(customTotal)} of {usd(amount)}
            </Text>
          )}

          <GradientButton
            title="Add Expense"
            onPress={submit}
            loading={saving}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  amountCard: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  amountLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  currency: { color: dark.accentGreen, fontSize: 26, fontWeight: '700' },
  amountInput: {
    color: dark.text,
    fontSize: 36,
    fontWeight: '800',
    minWidth: 140,
    textAlign: 'center',
    padding: 0,
  },

  label: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  labelInline: { marginTop: 0, marginBottom: 0 },
  field: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    color: dark.text,
    fontSize: 15,
  },

  payerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
  },
  payerName: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600' },
  changeLink: { color: dark.accentBlue, fontSize: 12, fontWeight: '700' },
  payerPicker: {
    backgroundColor: '#0F1A20',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  payerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  payerOptionText: { flex: 1, color: dark.text, fontSize: 13 },

  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.sm,
    padding: 2,
  },
  modeButton: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm - 2 },
  modeButtonActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  modeText: { color: dark.textMuted, fontSize: 11, fontWeight: '700' },
  modeTextActive: { color: dark.text },

  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  splitRowActive: { borderColor: 'rgba(0,196,208,0.45)' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: dark.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },
  splitName: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '600' },
  splitAmount: { color: dark.text, fontSize: 14, fontWeight: '700' },
  splitAmountOff: { color: dark.textMuted },
  customInput: {
    minWidth: 76,
    textAlign: 'right',
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
    paddingVertical: 2,
  },
  customTotal: { fontSize: 12, textAlign: 'right', marginTop: 2 },
  customOk: { color: dark.accentGreen },
  customBad: { color: '#F87171' },

  submit: { marginTop: spacing.lg },
});

export default AddExpenseScreen;
