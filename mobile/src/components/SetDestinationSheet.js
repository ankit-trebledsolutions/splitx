import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import FormSheet, { makeSheetStyles } from './FormSheet';
import TextField from './TextField';
import { useStyles } from '../theme';

// Fills in a trip's destination after the fact (admin only, enforced by the
// server too). Suggested stays and attractions need it.
const SetDestinationSheet = ({ visible, current = '', onClose, onSubmit }) => {
  const sheetStyles = useStyles(makeSheetStyles);
  const [location, setLocation] = useState(current);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLocation(current ?? '');
    setError('');
    setSaving(false);
  }, [visible, current]);

  const submit = async () => {
    const trimmed = location.trim();
    if (trimmed.length < 2) {
      setError('Add a destination, for example Jaipur or Bali');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={current ? 'Change destination' : 'Trip destination'}
      subtitle="Where is this trip going? A city or a region works best."
      submitLabel="Save"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Destination</Text>
      <TextField
        value={location}
        onChangeText={(text) => {
          setLocation(text);
          if (error) setError('');
        }}
        placeholder="e.g. Jaipur, Rajasthan"
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={error || undefined}
      />
    </FormSheet>
  );
};

export default SetDestinationSheet;
