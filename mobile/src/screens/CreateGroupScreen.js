import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import SelectField from '../components/SelectField';
import StepperField from '../components/StepperField';
import GradientButton from '../components/GradientButton';
import { createGroup } from '../api/groups.api';
import { spacing } from '../theme';

export const GROUP_TYPES = [
  { label: 'Trip', value: 'trip' },
  { label: 'Home', value: 'home' },
  { label: 'Couple', value: 'couple' },
  { label: 'Event', value: 'event' },
  { label: 'Other', value: 'other' },
];

const CreateGroupScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState('trip');
  const [totalDays, setTotalDays] = useState(2);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const isTrip = groupType === 'trip';

  const handleContinue = async () => {
    if (name.trim().length < 2) {
      setErrors({ name: 'Group name must be at least 2 characters' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim(),
        groupType,
        ...(isTrip ? { totalDays } : {}),
      });
      navigation.replace('GroupInvite', { group });
    } catch (err) {
      Alert.alert('Could not create group', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create Group"
      subtitle="Set up your group details"
      onBack={navigation.canGoBack() ? navigation.goBack : undefined}
    >
      <TextField
        label="Group Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Summer Trip 2026"
        error={errors.name}
      />

      <TextField
        label="Group Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What is this group for?"
        multiline
      />

      <SelectField
        label="Group Type"
        value={groupType}
        options={GROUP_TYPES}
        onChange={setGroupType}
      />

      {isTrip && (
        <StepperField
          label="Total Days"
          value={totalDays}
          onChange={setTotalDays}
          min={1}
          max={90}
        />
      )}

      <View style={styles.spacer} />

      <GradientButton
        title="Continue"
        onPress={handleContinue}
        loading={loading}
        style={styles.button}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  spacer: { flex: 1, minHeight: spacing.xl },
  button: { marginBottom: spacing.md },
});

export default CreateGroupScreen;
