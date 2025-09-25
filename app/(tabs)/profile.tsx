import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { getCurrentUser, getMyProfile, updateMyProfile, signOut } from '../../src/features/auth/api';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    website: ''
  });
  const router = useRouter();

  const settings = [
    { id: 'account', title: 'Account Settings', subtitle: 'Manage your account' },
    { id: 'notifications', title: 'Notifications', subtitle: 'Configure alerts and updates' },
    { id: 'privacy', title: 'Privacy & Security', subtitle: 'Control your data' },
    { id: 'billing', title: 'Billing', subtitle: 'Manage subscription and payments' },
    { id: 'help', title: 'Help & Support', subtitle: 'Get assistance' },
    { id: 'about', title: 'About', subtitle: 'App information' },
  ];

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await getCurrentUser();
      if (!userData) {
        router.push('/login');
        return;
      }

      setUser(userData);

      const profileData = await getMyProfile();
      setProfile(profileData);

      if (profileData) {
        setEditForm({
          full_name: profileData.full_name || '',
          website: profileData.website || ''
        });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleSaveProfile = async () => {
    try {
      const updatedProfile = await updateMyProfile(editForm);
      setProfile(updatedProfile);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Profile update error:', error);
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.name}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.name}>{profile?.full_name || 'No Name Set'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.plan}>Free Plan</Text>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>12</Text>
            <Text style={styles.statLabel}>Videos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>2.4K</Text>
            <Text style={styles.statLabel}>Total Views</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>28</Text>
            <Text style={styles.statLabel}>Days Active</Text>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          {settings.map((setting) => (
            <TouchableOpacity key={setting.id} style={styles.settingItem}>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>{setting.title}</Text>
                <Text style={styles.settingSubtitle}>{setting.subtitle}</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isEditing ? (
          <View style={styles.editSection}>
            <Text style={styles.sectionTitle}>Edit Profile</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#8a9099"
                value={editForm.full_name}
                onChangeText={(text) => setEditForm({...editForm, full_name: text})}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Website</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your website"
                placeholderTextColor="#8a9099"
                value={editForm.website}
                onChangeText={(text) => setEditForm({...editForm, website: text})}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.actionButtonText}>Save Changes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setIsEditing(false)}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.actionButtonText}>Edit Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Upgrade Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const BG = '#0b0f14';
const CARD = '#151a21';
const BORDER = '#232932';
const TEXT = '#e7ebf0';
const MUTED = '#8a9099';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2a3038',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: TEXT,
    fontSize: 24,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: MUTED,
    marginBottom: 8,
  },
  plan: {
    fontSize: 14,
    color: TEXT,
    fontWeight: '600',
    backgroundColor: '#2a3038',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsSection: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: MUTED,
  },
  statDivider: {
    width: 1,
    backgroundColor: BORDER,
    marginHorizontal: 20,
  },
  settingsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: MUTED,
  },
  settingArrow: {
    fontSize: 24,
    color: MUTED,
  },
  quickActions: {
    gap: 12,
    marginBottom: 32,
  },
  actionButton: {
    backgroundColor: '#2a3038',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: CARD,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5a2d2d',
    marginBottom: 20,
  },
  signOutText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
  editSection: {
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 8,
  },
  input: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: TEXT,
  },
  editActions: {
    gap: 12,
    marginTop: 16,
  },
  saveButton: {
    backgroundColor: '#6366f1',
  },
});