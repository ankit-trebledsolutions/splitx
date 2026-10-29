import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import AuthFooter from '../components/AuthFooter';
import AppAlert from '../components/AppAlert';
import {
  BIO_MAX,
  normalizeUsername,
  usernameError,
  phoneError,
  nameError,
  bioError,
} from '../utils/profileValidation';
import { spacing, useStyles } from '../theme';

/**
 * The first screen after sign-up (email or Google). RootNavigator shows it in
 * place of the app while the server says profileComplete is false, i.e. until
 * the person has a username and a phone number. Bio is optional.
 *
 * Whatever is already known (name from the form or Google, phone typed at
 * sign-up) is filled in, so most people only need to pick a username.
 */
const CompleteProfileScreen = () => {
  const styles = useStyles(makeStyles);
  const { user, updateProfile, logout } = useAuth();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    username: user?.username ?? '',
    phone: user?.phone ?? '',
    bio: user?.bio ?? '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async () => {
    const next = {
      name: nameError(form.name),
      username: usernameError(form.username),
      phone: phoneError(form.phone),
      bio: bioError(form.bio),
    };
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      // On success RootNavigator swaps this screen for the app by itself.
      await updateProfile({
        name: form.name.trim(),
        username: normalizeUsername(form.username),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
      });
    } catch (err) {
      if (err.status === 409) setErrors({ username: err.message });
      else AppAlert.alert('Could not save profile', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      title="Complete your profile"
      subtitle="Tell your friends who you are. You can change this later in your profile."
    >
      <TextField
        label="Full Name"
        value={form.name}
        onChangeText={setField('name')}
        placeholder="Your name"
        autoComplete="name"
        error={errors.name}
      />
      <TextField
        label="Username"
        value={form.username}
        onChangeText={setField('username')}
        placeholder="janedoe"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={21}
        error={errors.username}
      />
      <TextField
        label="Phone Number"
        value={form.phone}
        onChangeText={setField('phone')}
        placeholder="+91 "
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
        error={errors.phone}
      />
      <TextField
        label="Bio (optional)"
        value={form.bio}
        onChangeText={setField('bio')}
        placeholder="Tell your friends a little about yourself"
        multiline
        maxLength={BIO_MAX}
        textAlignVertical="top"
        inputStyle={styles.bioInput}
        error={errors.bio}
        style={styles.bioField}
      />
      <Text style={styles.counter}>
        {form.bio.length}/{BIO_MAX}
      </Text>

      <GradientButton
        title="Continue"
        onPress={submit}
        loading={saving}
        style={styles.button}
      />

      <AuthFooter text="Not you?" linkText="Log Out" onPress={logout} />
    </AuthLayout>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  bioField: { marginBottom: spacing.xs },
  bioInput: { height: 110, paddingTop: spacing.md },
  counter: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  button: { marginTop: spacing.sm },
});

export default CompleteProfileScreen;
