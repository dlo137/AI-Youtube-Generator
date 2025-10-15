import 'dotenv/config';

export default {
  expo: {
    name: "Youtube Thumbnail Generator",
    slug: "youtube-thumbnail-generator",
    version: "1.0.7",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    scheme: "thumbnailgen",
    jsEngine: "jsc",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    extra: {
      eas: {
        projectId: "c1df1c80-b01c-45b2-bd7f-87e1a6b25e15"
      },
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.watsonsweb.thumbnail-generator",
      jsEngine: "jsc",
      icon: "./assets/icon.png",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library to save generated thumbnails."
      },
      usesAppleSignIn: true
    },
    android: {
      package: "com.watsonsweb.thumbnail-generator",
      jsEngine: "jsc",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      permissions: [
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    }
  },
};