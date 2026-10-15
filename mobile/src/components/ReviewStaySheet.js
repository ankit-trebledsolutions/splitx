import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark, spacing } from '../theme';

const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

// Stars and a few words about a stay, given from its card once the group has
// stayed there (not when it is first added). Opens on what was saved before.
const ReviewStaySheet = ({ visible, stay, onClose, onSubmit }) => {
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStars(stay?.stars ?? 0);
    setReview(stay?.review ?? '');
    setError('');
    setSaving(false);
  }, [visible, stay]);

  const submit = async () => {
    if (!stars) {
      setError('Tap a star to rate the stay');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ stars, review: review.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={stay?.stars ? 'Edit Review' : 'Rate this Stay'}
      subtitle={stay?.name}
      submitLabel="Save Review"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Stars</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((value) => (
          <TouchableOpacity
            key={value}
            onPress={() => {
              setStars(value);
              if (error) setError('');
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={value <= stars ? 'star' : 'star-outline'}
              size={32}
              color={value <= stars ? '#F5B342' : dark.textMuted}
            />
          </TouchableOpacity>
        ))}
        <Text style={styles.starWord}>{STAR_WORDS[stars]}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={sheetStyles.label}>Review</Text>
      <TextField
        value={review}
        onChangeText={setReview}
        placeholder="How was it? Rooms, location, staff…"
        multiline
        maxLength={500}
        inputStyle={styles.reviewInput}
      />
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  starWord: { color: dark.textMuted, fontSize: 13, fontWeight: '600', marginLeft: spacing.xs },
  error: { color: '#F87171', fontSize: 12, marginTop: -spacing.sm, marginBottom: spacing.md },
  reviewInput: { minHeight: 96, textAlignVertical: 'top' },
});

export default ReviewStaySheet;
