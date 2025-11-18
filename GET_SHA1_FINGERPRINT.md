# How to Get Your Android SHA-1 Fingerprint

Your debug keystore doesn't exist yet on this machine. Here are your options:

## Option 1: Get Production SHA-1 from Google Play Console (EASIEST)

Since your app is already published, get the SHA-1 from Play Console:

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select your app: **Youtube Thumbnail Generator**
3. Navigate to: **Setup > App signing**
4. Look for **App signing key certificate** section
5. Copy the **SHA-1 certificate fingerprint** (looks like: `AB:CD:EF:12:34:...`)

This is your PRODUCTION SHA-1 that you need for the Google Cloud Console.

## Option 2: Generate Debug Keystore & Get SHA-1

If you want to test in development mode, you need to generate a debug keystore:

### Step 1: Build the Android app locally (this creates debug.keystore)
```bash
npx expo prebuild --platform android
```

### Step 2: Get the SHA-1 from the newly created keystore

After the build completes, the debug keystore will be at:
`C:\Users\aidaw\.android\debug.keystore`

Then run this command to get the SHA-1:

**If you have Java/keytool installed:**
```bash
keytool -list -v -keystore "C:\Users\aidaw\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

Look for the line that says `SHA1:` in the output.

**If keytool command not found:**

You can also use an online keystore viewer tool (upload your debug.keystore file) - but only do this with DEBUG keystores, never production ones!

## Option 3: Use EAS Build Credentials

If you're using EAS Build (Expo Application Services), you can get the SHA-1 from there:

```bash
eas credentials
```

Select Android, and view your keystore information. The SHA-1 will be displayed.

## What You Need:

For your app to work properly, you need:

1. **Production SHA-1** - From Google Play Console (for users who download from Play Store)
2. **Debug SHA-1** - From local debug.keystore (for testing in development)

Both need to be added to Google Cloud Console as separate Android OAuth clients.

## Next Steps After Getting SHA-1:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services > Credentials**
3. Create **OAuth 2.0 Client ID**:
   - Type: Android
   - Package name: `com.watsonsweb.thumbnail-generator`
   - SHA-1: Paste the fingerprint you got above
4. Copy the generated **Client ID**
5. Add it to Supabase (Dashboard > Authentication > Providers > Google)

---

## Quick Command Summary:

```bash
# Check if debug keystore exists
ls "C:\Users\aidaw\.android\debug.keystore"

# If it doesn't exist, build Android to create it
npx expo prebuild --platform android

# Then get SHA-1 (if keytool is available)
keytool -list -v -keystore "C:\Users\aidaw\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

The easiest option is **Option 1** - just get it from Google Play Console since your app is already published!
