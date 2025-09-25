import 'dotenv/config';

export default {
  expo: {
    name: "Youtube Thumbnail Generator",
    slug: "youtube-thumbnail-generator",
    scheme: "thumbnailgen",               // <— custom URL scheme for deep links
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
    ios: { bundleIdentifier: "com.watsonsweb.thumbnail-generator" },
    android: { package: "com.watsonsweb.thumbnail-generator" },
  },
};