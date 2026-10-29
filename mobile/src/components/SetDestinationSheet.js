import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import FormSheet from './FormSheet';
import DestinationFields from './DestinationFields';
import { spacing, useStyles } from '../theme';

const EMPTY = { countryCode: '', stateCode: '' };

// Sets or changes a trip's destination after the fact (admin only, enforced
// by the server too): the country, then the state, picked from the lists.
// Suggested stays and attractions, and the name search, are kept to it.
//   current:     the group's picked destination ({ countryCode, stateCode }), or null
//   currentText: the destination as text, for a group that only ever typed one
//   onSubmit:    ({ destination: { countryCode, stateCode } }) => Promise
const SetDestinationSheet = ({ visible, current = null, currentText = '', onClose, onSubmit }) => {
  const styles = useStyles(makeStyles);
  const [value, setValue] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValue({ countryCode: current?.countryCode ?? '', stateCode: current?.stateCode ?? '' });
    setErrors({});
    setSaving(false);
    // The codes, not the object: a group refresh must not reset a half-made choice.
  }, [visible, current?.countryCode, current?.stateCode]);

  const submit = async () => {
    if (!value.countryCode) {
      setErrors({ countryCode: 'Pick the country the trip is going to' });
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ destination: { countryCode: value.countryCode, stateCode: value.stateCode || undefined } });
    } finally {
      setSaving(false);
    }
  };

  const hasText = Boolean(currentText) && !current?.countryCode;

  return (
    <FormSheet
      visible={visible}
      title={current || currentText ? 'Change destination' : 'Trip destination'}
      subtitle="Where is this trip going? Pick the country, then the state."
      submitLabel="Save"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      {hasText ? (
        <Text style={styles.note}>
          Set as “{currentText}” so far. Pick it from the lists so suggestions and search stay within it.
        </Text>
      ) : null}
      <DestinationFields
        value={value}
        onChange={(next) => {
          setValue(next);
          if (errors.countryCode) setErrors({});
        }}
        errors={errors}
      />
    </FormSheet>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  note: { color: theme.textMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },
});

export default SetDestinationSheet;
