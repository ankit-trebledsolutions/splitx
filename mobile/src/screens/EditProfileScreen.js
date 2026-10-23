import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from '../components/DarkScreen';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import { useAuth } from '../context/AuthContext';
import {
  BIO_MAX,
  normalizeUsername,
  usernameError,
  phoneError,
  nameError,
  bioError,
} from '../utils/profileValidation';
import { spacing, useStyles } from '../theme';
import AppAlert from '../components/AppAlert';

const EditProfileScreen = ({ navigation }) => {
  const styles = useStyles(makeStyles);
  const { user, updateProfile } = useAuth();
  // The real saved values only: the design placeholders in data/profile must
  // never be saved over someone's profile.
  const [form, setForm] = useState({
    name: user?.name ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    bio: user?.bio ?? '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const save = async () => {
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
      // Email is not sent: changing it would need the new address verified.
      await updateProfile({
        name: form.name.trim(),
        username: normalizeUsername(form.username),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
      });
      navigation.goBack();
    } catch (err) {
      if (err.status === 409) setErrors({ username: err.message });
      else AppAlert.alert('Could not save profile', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DarkScreen>
      <ScreenHeader title="Edit Profile" onBack={navigation.goBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <Avatar name={form.name} size={96} />
            <TouchableOpacity
              style={styles.cameraBadge}
              activeOpacity={0.8}
              onPress={() =>
                AppAlert.alert('Profile photo', 'Photo upload is not wired up yet.')
              }
            >
              <Ionicons name="camera" size={14} color="#04121C" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => AppAlert.alert('Profile photo', 'Photo upload is not wired up yet.')}
          >
            <Text style={styles.changePhoto}>Change Profile Photo</Text>
          </TouchableOpacity>

          <TextField
            label="Full Name"
            value={form.name}
            onChangeText={setField('name')}
            placeholder="Jane Doe"
            error={errors.name}
          />
          <TextField
            label="Username"
            value={form.username}
            onChangeText={setField('username')}
            placeholder="janedoe"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
            error={errors.username}
          />
          <TextField
            label="Email"
            value={form.email}
            onChangeText={setField('email')}
            placeholder="jane.doe@outlook.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={false}
            inputStyle={styles.readOnly}
          />
          <TextField
            label="Phone Number"
            value={form.phone}
            onChangeText={setField('phone')}
            placeholder="+1 (555) 019-2834"
            keyboardType="phone-pad"
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
          />

          <GradientButton
            title="Save Changes"
            onPress={save}
            loading={saving}
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </DarkScreen>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  avatarWrap: { alignSelf: 'center', marginTop: spacing.md },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.accentFill,
    borderWidth: 3,
    borderColor: theme.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhoto: {
    color: theme.accentGreen,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  bioInput: { height: 110, paddingTop: spacing.md },
  readOnly: { opacity: 0.6 },
  button: { marginTop: spacing.md },
});

export default EditProfileScreen;
