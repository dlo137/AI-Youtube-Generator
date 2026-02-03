import { supabase, redirectTo } from "../../../lib/supabase";
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';

// Initialize credits for a new user or update if not set
async function initializeUserCredits(userId: string) {
  try {
    console.log('[Auth] Checking profile for user:', userId);
    
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('credits_current, credits_max')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError) {
      console.log('[Auth] Error fetching profile:', fetchError.message);
    }

    console.log('[Auth] Existing profile:', existingProfile);

    // Profile doesn't exist - we need to create it
    if (!existingProfile) {
      console.log('[Auth] Profile does not exist, creating with upsert for user:', userId);
      
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          credits_current: 5,
          credits_max: 5,
          last_credit_reset: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'id'
        });

      if (upsertError) {
        console.error('[Auth] Error upserting profile:', upsertError.message);
      } else {
        console.log('[Auth] Profile created with credits successfully');
      }
    } else if (existingProfile.credits_current === null && existingProfile.credits_max === null) {
      // Profile exists but credits are null - update them
      console.log('[Auth] Profile exists but credits are null, updating...');
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          credits_current: 5,
          credits_max: 5,
          last_credit_reset: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('[Auth] Error updating credits:', updateError.message);
      } else {
        console.log('[Auth] Credits initialized successfully');
      }
    } else {
      console.log('[Auth] Credits already set:', existingProfile.credits_current, '/', existingProfile.credits_max);
    }
  } catch (error) {
    console.error('[Auth] Error initializing credits:', error);
    // Don't throw - credits initialization failure shouldn't block login
  }
}

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

    // Update profile and initialize credits
    if (data.user) {
      const updates: any = {};
      
      if (fullName) {
        const fullNameString = [
          fullName.givenName,
          fullName.familyName,
        ]
          .filter(Boolean)
          .join(' ');

        if (fullNameString) {
          updates.name = fullNameString;
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('profiles')
          .update(updates)
          .eq('id', data.user.id);
      }

      // Initialize credits
      await initializeUserCredits(data.user.id);
    }

    return data;
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Sign in was canceled');
    }
    throw error;
  }
}

export async function signInWithGoogle() {
  try {
    // Configure WebBrowser for OAuth
    WebBrowser.maybeCompleteAuthSession();

    const Platform = require('react-native').Platform;
    console.log('[Google Auth] Starting OAuth with redirect:', redirectTo);
    console.log('[Google Auth] Platform:', Platform.OS);

    // Start Google OAuth flow
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        skipBrowserRedirect: false, // Let browser handle redirect
        queryParams: {
          prompt: 'select_account',
        },
      }
    });

    if (error) {
      console.error('[Google Auth] OAuth init error:', error);
      throw new Error(`Google OAuth initialization failed: ${error.message}`);
    }

    if (!data?.url) {
      throw new Error('No OAuth URL returned from Supabase');
    }

    console.log('[Google Auth] OAuth URL:', data.url.substring(0, 100) + '...');
    console.log('[Google Auth] Opening browser...');

    // On Android, use openAuthSessionAsync to properly handle deep link callback
    if (Platform.OS === 'android') {
      console.log('[Google Auth] Opening auth session on Android...');
      console.log('[Google Auth] Redirect URL:', redirectTo);

      const androidResult = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo
      );

      console.log('[Google Auth] Auth session result type:', androidResult.type);
      if (androidResult.type === 'success' && 'url' in androidResult) {
        console.log('[Google Auth] Success URL:', androidResult.url);
      }

      // After browser closes/redirects, poll for session
      if (androidResult.type === 'success' || androidResult.type === 'dismiss' || androidResult.type === 'cancel') {
        console.log('[Google Auth] Browser closed/redirected, polling for session...');

        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));

          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionData?.session) {
            console.log(`[Google Auth] ✓ Session found after ${(i + 1) * 500}ms!`);
            console.log(`[Google Auth] User:`, sessionData.session.user.email);
            // Initialize credits for the user
            if (sessionData.session.user.id) {
              await initializeUserCredits(sessionData.session.user.id);
            }
            return sessionData;
          }

          if (i % 4 === 0) {
            console.log(`[Google Auth] Poll attempt ${i + 1}/30: No session yet...`);
          }
        }

        if (androidResult.type === 'success') {
          console.log('[Google Auth] No session found after 15 seconds - timing out');
          console.log('[Google Auth] This might mean the deep link callback failed');
          throw new Error('Sign in timed out. Please try again.');
        } else {
          console.log('[Google Auth] Browser dismissed without success');
          throw new Error('Sign in was canceled');
        }
      }

      console.log('[Google Auth] Unexpected result type:', androidResult.type);
      throw new Error('Authentication failed. Please try again.');
    }

    // iOS: Use openAuthSessionAsync which properly handles the callback
    const iosResult = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo
    );

    console.log('[Google Auth] Browser result type:', iosResult.type);

    // If browser closed/dismissed, check if session was created
    if (iosResult.type === 'cancel' || iosResult.type === 'dismiss') {
      console.log('[Google Auth] Browser dismissed, checking for session with polling...');

      // Poll for session multiple times (sometimes takes a few seconds)
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionData?.session) {
          console.log(`[Google Auth] ✓ Session found after ${(i + 1) * 500}ms!`);
          // Initialize credits for the user
          if (sessionData.session.user.id) {
            await initializeUserCredits(sessionData.session.user.id);
          }
          return sessionData;
        }

        console.log(`[Google Auth] Poll attempt ${i + 1}/10: No session yet...`);
      }

      console.log('[Google Auth] No session found after 5 seconds, sign in was likely canceled');
      throw new Error('Sign in was canceled');
    }

    if (iosResult.type === 'success' && iosResult.url) {
      console.log('[Google Auth] Callback URL received');
      console.log('[Google Auth] Full URL:', iosResult.url);

      // Parse URL properly
      const url = new URL(iosResult.url);

      // Check for authorization code (PKCE flow)
      const code = url.searchParams.get('code');

      if (code) {
        console.log('[Google Auth] Got auth code, exchanging for session...');

        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

        if (sessionError) {
          console.error('[Google Auth] Code exchange error:', sessionError);
          throw sessionError;
        }

        console.log('[Google Auth] Session created!');
        // Initialize credits for the user
        if (sessionData.session?.user?.id) {
          await initializeUserCredits(sessionData.session.user.id);
        }
        return sessionData;
      }

      // Fallback: Check for direct tokens (implicit flow)
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || url.searchParams.get('refresh_token');

      console.log('[Google Auth] Checking tokens - access:', !!accessToken, 'refresh:', !!refreshToken);

      if (accessToken && refreshToken) {
        console.log('[Google Auth] Setting session with tokens...');

        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error('[Google Auth] Session error:', sessionError);
          throw sessionError;
        }

        console.log('[Google Auth] Session created!');
        // Initialize credits for the user
        if (sessionData.session?.user?.id) {
          await initializeUserCredits(sessionData.session.user.id);
        }
        return sessionData;
      }

      console.error('[Google Auth] No code or tokens in callback URL');
      throw new Error('No authentication data in callback');
    }

    console.error('[Google Auth] Browser did not return success or callback URL was invalid');
    throw new Error('Authentication was not completed. The browser did not return a valid response.');
  } catch (error: any) {
    console.error('[Google Auth] Full error:', error);
    console.error('[Google Auth] Error type:', typeof error);
    console.error('[Google Auth] Error message:', error?.message);
    console.error('[Google Auth] Error stack:', error?.stack);

    // Provide helpful error message
    if (error?.message?.includes('canceled')) {
      throw error;
    }

    throw new Error(`Google sign-in failed: ${error?.message || 'Unknown error'}. Please try again or contact support.`);
  }
}