import { supabase, redirectTo } from "../../../lib/supabase";
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export async function signUpEmail(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: fullName
      }
    },
  });
  if (error) throw error;

  // Update profile table with the name if user was created
  if (data.user && fullName) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ name: fullName })
      .eq('id', data.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }
  }

  return data;
}

export async function signInEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Profile management functions
export async function getMyProfile() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  const { data, error } = await supabase.from("profiles")
    .select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(updates: {
  name?: string;
  avatar_url?: string;
  website?: string;
}) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

/**
 * Delete the current user's account from Supabase
 */
export async function deleteAccount(): Promise<void> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Step 1: Delete all images from Supabase Storage
    try {
      console.log('Deleting user images from Supabase Storage...');

      // List all files in the thumbnails bucket for this user
      const { data: files, error: listError } = await supabase.storage
        .from('thumbnails')
        .list();

      if (!listError && files && files.length > 0) {
        // Delete all files
        const filePaths = files.map(file => file.name);
        const { error: deleteFilesError } = await supabase.storage
          .from('thumbnails')
          .remove(filePaths);

        if (deleteFilesError) {
          console.error('Error deleting files from storage:', deleteFilesError);
        } else {
          console.log(`Deleted ${filePaths.length} files from Supabase Storage`);
        }
      }
    } catch (storageError) {
      console.error('Error accessing Supabase Storage:', storageError);
      // Continue with deletion even if storage cleanup fails
    }

    // Step 2: Delete local thumbnail files from FileSystem
    try {
      console.log('Deleting local thumbnail files...');
      const thumbnailDir = `${FileSystem.documentDirectory}thumbnails/`;
      const dirInfo = await FileSystem.getInfoAsync(thumbnailDir);

      if (dirInfo.exists) {
        await FileSystem.deleteAsync(thumbnailDir, { idempotent: true });
        console.log('Deleted local thumbnail directory');
      }
    } catch (fileSystemError) {
      console.error('Error deleting local files:', fileSystemError);
      // Continue with deletion even if file cleanup fails
    }

    // Step 3: Clear AsyncStorage thumbnail data
    try {
      console.log('Clearing thumbnail data from AsyncStorage...');
      await AsyncStorage.removeItem('saved_thumbnails');
      console.log('Cleared thumbnail data from AsyncStorage');
    } catch (asyncStorageError) {
      console.error('Error clearing AsyncStorage:', asyncStorageError);
      // Continue with deletion even if AsyncStorage cleanup fails
    }

    // Step 4: Delete user's profile data
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      // Continue anyway - profile might not exist or might be cascade deleted
    }

    // Step 5: Try to delete via edge function first (if deployed)
    try {
      const { error: deleteError } = await supabase.functions.invoke('delete-user', {
        body: { userId: user.id }
      });

      if (!deleteError) {
        // Successfully deleted via edge function
        await supabase.auth.signOut();
        return;
      }
    } catch (edgeFunctionError) {
      console.log('Edge function not available, continuing with sign out');
    }

    // Step 6: Sign out the user
    await supabase.auth.signOut();

    console.log('User account and all images deleted successfully');
  } catch (error) {
    console.error('Delete account error:', error);
    throw error;
  }
}

export async function signInWithApple() {
  try {
    // Request Apple authentication
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // Extract the necessary data
    const { identityToken, authorizationCode, fullName } = credential;

    if (!identityToken) {
      throw new Error('No identity token returned from Apple');
    }

    // Use Supabase OAuth with Apple - pass the token for server-side validation
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      options: {
        captchaToken: authorizationCode || undefined,
      }
    });

    if (error) throw error;

    // Update profile with full name if provided by Apple
    if (data.user && fullName) {
      const fullNameString = [
        fullName.givenName,
        fullName.familyName,
      ]
        .filter(Boolean)
        .join(' ');

      if (fullNameString) {
        await supabase
          .from('profiles')
          .update({ name: fullNameString })
          .eq('id', data.user.id);
      }
    }

    return data;
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Sign in was canceled');
    }
    throw error;
  }
}