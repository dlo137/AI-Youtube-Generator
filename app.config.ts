export default {
  expo: {
    name: "AI Thumbnails",
    slug: "youtube-thumbnail-generator",
    version: "1.0.23",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    scheme: "thumbnailgen",
    plugins: [
      "./plugins/withIapFlavor",
      [
        "react-native-iap",
        {
          paymentProvider: "Apple",
          // Force StoreKit 1 mode for better compatibility
          // StoreKit 2 (default in v14+) may have issues with sandbox/TestFlight
        }
      ],
      "expo-router"
    ],
    updates: {
      fallbackToCacheTimeout: 0,
      enabled: false
    },
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
      icon: "./assets/icon.png",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library to save generated thumbnails.",
        NSPhotoLibraryAddUsageDescription: "This app needs permission to save thumbnails to your photo library."
      },
      usesAppleSignIn: true
    },
    android: {
      package: "com.aidawrapper.ThumbnailGenerator",
      versionCode: 14,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      permissions: [
        "WRITE_EXTERNAL_STORAGE",
        "com.android.vending.BILLING"
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          data: [
            {
              scheme: "thumbnailgen",
              host: "auth"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "zxklggjxauvvesqwqvgi.supabase.co",
              pathPrefix: "/auth/v1/callback"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    }
  },
};