# Fix: "Unacceptable audience in id_token" Error

## Problem
TestFlight users getting error: `unacceptable audience in id_token: .com.watsonsweb.thumbnail-generator`

## Root Cause
The JWT token's audience claim doesn't match Supabase's expected audience for your bundle identifier.

## Solution

### Option 1: Update Supabase Dashboard Settings (Recommended)

1. **Go to Supabase Dashboard:**
   - URL: https://supabase.com/dashboard/project/zxklggjxauvvesqwqvgi/auth/url-configuration

2. **Add Redirect URLs:**
   In the "Redirect URLs" section, add:
   ```
   com.watsonsweb.thumbnail-generator://
   com.watsonsweb.thumbnail-generator://**
   thumbnailgen://
   thumbnailgen://**
   ```

3. **For Apple Sign In (if enabled):**
   - Go to: Authentication > Providers > Apple
   - Ensure "Bundle ID" is set to: `com.watsonsweb.thumbnail-generator`
   - Services ID should match: `com.watsonsweb.thumbnail-generator`

4. **Check JWT Settings:**
   - Go to: Authentication > Settings
   - Scroll to "JWT Settings"
   - Verify "JWT Expiry" is reasonable (default: 3600 seconds)
   - Site URL should be set (e.g., `https://zxklggjxauvvesqwqvgi.supabase.co`)

### Option 2: Update Bundle Identifier (Alternative)

If the above doesn't work, there might be a mismatch between what Supabase expects and what your app is sending.

Check your Apple Developer Console:
1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Find your app's identifier
3. Make sure it EXACTLY matches: `com.watsonsweb.thumbnail-generator`

### Option 3: Force Refresh Token on App Launch

Add this code to force a fresh authentication:

```typescript
// In your app's root component or App.tsx
useEffect(() => {
  const checkAndRefreshAuth = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (session && error?.message?.includes('audience')) {
      // Force sign out and clear bad tokens
      await supabase.auth.signOut();
      Alert.alert('Please sign in again', 'Your session has expired.');
    }
  };

  checkAndRefreshAuth();
}, []);
```

## Verification

After making changes:

1. **Delete the app from TestFlight device**
2. **Reinstall from TestFlight**
3. **Try signing in again**

The token issue should be resolved.

## Still Not Working?

If the issue persists, check:
1. Are you using Apple Sign In? The error often occurs with Apple Auth.
2. Run this command to verify your build's bundle ID:
   ```bash
   npx expo config --type public
   ```
3. Look for `ios.bundleIdentifier` in the output - it must match Supabase settings exactly.

## Common Causes

- ❌ Bundle ID mismatch between Xcode/EAS and Supabase
- ❌ Apple Sign In Service ID not configured correctly
- ❌ Missing redirect URLs in Supabase dashboard
- ❌ Stale authentication tokens from development builds
