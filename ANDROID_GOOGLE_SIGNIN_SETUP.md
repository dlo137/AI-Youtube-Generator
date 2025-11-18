# Android Google Sign-In Setup Guide

This guide will help you fix the Google Sign-In issues on Android.

## Issue Summary
Google Sign-In works on iOS but not Android due to missing Android-specific configuration.

## Fixed Issues
✅ **Android Intent Filters** - Added HTTPS deep linking intent filter for Supabase OAuth redirects

## Required Setup Steps

### 1. Get Your SHA-1 Fingerprints

You need to add your Android app's SHA-1 fingerprint to Google Cloud Console.

#### For Debug Builds (Development):
```bash
# Windows (PowerShell)
keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android | findstr "SHA1:"

# Mac/Linux
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
```

#### For Production Builds (Play Store):
```bash
# If you have a production keystore file
keytool -list -v -keystore path/to/your-production.keystore -alias your-alias-name

# Or get it from Google Play Console:
# Go to: Play Console > Your App > Setup > App signing > App signing key certificate
# Copy the SHA-1 certificate fingerprint
```

### 2. Add SHA-1 to Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one if needed)
3. Go to **APIs & Services > Credentials**
4. Find your **OAuth 2.0 Client ID** for Android (or create one):
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Android"
   - Package name: `com.watsonsweb.thumbnail-generator`
   - Paste your **SHA-1 certificate fingerprint** from step 1
   - Click "Create"
5. **Repeat for BOTH debug AND production SHA-1 fingerprints** (create separate OAuth clients for each)

### 3. Configure Supabase with Android Client ID

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `zxklggjxauvvesqwqvgi`
3. Go to **Authentication > Providers > Google**
4. You should see fields for:
   - **Authorized Client IDs** (or similar)

5. Add **THREE** client IDs:
   - Your **Web Client ID** (should already be there)
   - Your **iOS Client ID** (should already be there if iOS works)
   - Your **Android Client ID** (the one you just created in Google Cloud Console)

   To find your Android Client ID:
   - Go back to Google Cloud Console > APIs & Services > Credentials
   - Copy the **Client ID** for your Android OAuth 2.0 client
   - It should look like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`
   - Paste it into Supabase

6. **Important:** In Supabase Google Provider settings, also add these redirect URLs:
   - `thumbnailgen://auth/callback`
   - `https://zxklggjxauvvesqwqvgi.supabase.co/auth/v1/callback`

### 4. Verify Google Cloud Configuration

Make sure your Google Cloud Console has these settings:

1. **Authorized redirect URIs** (in your Web OAuth client):
   - `https://zxklggjxauvvesqwqvgi.supabase.co/auth/v1/callback`
   - Any other Supabase callback URLs

2. **Authorized JavaScript origins** (optional but helpful):
   - `https://zxklggjxauvvesqwqvgi.supabase.co`

### 5. Rebuild Your Android App

After making these changes:

```bash
# Clear the build cache
npx expo prebuild --clean

# Build for Android
eas build --platform android --profile preview

# Or run locally for testing
npx expo run:android
```

## Testing

1. Open your app on an Android device
2. Try signing in with Google
3. Check the logs:
   ```bash
   npx expo start
   # Then open the app and check the console output
   ```

## Common Issues

### "Sign in failed" or "No authorization code"
- Verify SHA-1 is added to Google Cloud Console
- Make sure you added the Android Client ID to Supabase
- Rebuild the app after configuration changes

### "OAuth redirect URI mismatch"
- Check that Supabase redirect URLs include both:
  - `thumbnailgen://auth/callback`
  - `https://zxklggjxauvvesqwqvgi.supabase.co/auth/v1/callback`
- Verify Google Cloud Console has the Supabase callback URL in authorized redirects

### Browser opens but never returns to app
- This is fixed by the HTTPS intent filter (already added to app.config.ts)
- Make sure you rebuild the app after the intent filter change

## Need Help?

If you're still having issues:
1. Check the Expo logs for detailed error messages
2. Verify all three client IDs are in Supabase (Web, iOS, Android)
3. Make sure you're testing with the newly built app (old builds won't have the fixes)
4. Check that your Android app package name matches: `com.watsonsweb.thumbnail-generator`

## Summary Checklist

- [ ] Get debug SHA-1 fingerprint
- [ ] Get production SHA-1 fingerprint (if deploying to Play Store)
- [ ] Add SHA-1(s) to Google Cloud Console (create Android OAuth clients)
- [ ] Copy Android Client ID from Google Cloud
- [ ] Add Android Client ID to Supabase Google provider settings
- [ ] Verify redirect URLs in Supabase and Google Cloud
- [ ] Rebuild Android app with `npx expo prebuild --clean`
- [ ] Test Google Sign-In on Android device
