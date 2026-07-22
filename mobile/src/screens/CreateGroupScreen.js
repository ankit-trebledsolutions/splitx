import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { createGroup } from '../api/groups.api';
import TextField from '../components/TextField';
import Button from '../components/Button';
import { colors, spacing } from '../theme';

const CreateGroupScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Invalid name', 'Group name must be at least 2 characters.');
      return;
    }
    setLoading(true);
    try {
      const group = await createGroup({ name: name.trim(), description: description.trim() });
      navigation.replace('GroupDetail', { groupId: group._id, name: group.name });
    } catch (err) {
      Alert.alert('Could not create group', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextField
        variant="light"
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="Goa trip, Flat 4B, ..."
      />
      <TextField
        variant="light"
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What is this group for?"
        multiline
      />
      <Button title="Create group" onPress={handleCreate} loading={loading} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
});

export default CreateGroupScreen;
