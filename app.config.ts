import 'dotenv/config';

export default {
  expo: {
    name: "Youtube Thumbnail Generator",
    slug: "youtube-thumbnail-generator",
    scheme: "thumbnailgen",
    jsEngine: "jsc",
    extra: {
      eas: {
        projectId: "c1df1c80-b01c-45b2-bd7f-87e1a6b25e15"
      },
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
    ios: {
      bundleIdentifier: "com.watsonsweb.thumbnail-generator",
      jsEngine: "jsc",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library to save generated thumbnails."
      }
    },
    android: {
      package: "com.watsonsweb.thumbnail-generator",
      jsEngine: "jsc",
      permissions: [
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
  },
};