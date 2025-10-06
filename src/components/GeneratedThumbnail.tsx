import { View, TouchableOpacity, Image, Text, Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { saveThumbnail } from '../utils/thumbnailStorage';
import Svg, { Path } from 'react-native-svg';

// Create a mock function for development
const mockIsUserSubscribed = async () => {
  // In Expo Go, assume user is subscribed for testing
  return true;
};

// Conditionally import subscription utility
let isUserSubscribed: any = mockIsUserSubscribed;
try {
  const subscriptionUtils = require('../utils/subscriptionStorage');
  isUserSubscribed = subscriptionUtils.isUserSubscribed;
} catch (error) {
  console.log('Using mock subscription check for development');
}

interface GeneratedThumbnailProps {
  imageUrl: string;
  prompt: string;
  onEdit: () => void;
  style: any;
}

export default function GeneratedThumbnail({ imageUrl, prompt, onEdit, style }: GeneratedThumbnailProps) {
  const downloadThumbnail = async () => {
    if (!imageUrl) {
      Alert.alert('Error', 'No thumbnail to download');
      return;
    }

    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to save thumbnails');
        return;
      }

      // Download the image to local filesystem
      const filename = `thumbnail_${Date.now()}.png`;
      const docDir = (FileSystem as any).documentDirectory;
      if (!docDir) {
        throw new Error('Document directory not available');
      }
      const localUri = `${docDir}${filename}`;

      console.log('Downloading image from:', imageUrl);
      console.log('Saving to local path:', localUri);

      const { uri } = await (FileSystem as any).downloadAsync(imageUrl, localUri);

      // Save to photo library
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('AI Thumbnails', asset, false);

      Alert.alert('Success', 'Thumbnail saved to your photo library!');

    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to save thumbnail. Please try again.');
    }
  };

  return (
    <View style={style.imageWrapper}>
      <TouchableOpacity onPress={onEdit} activeOpacity={0.8}>
        <Image
          key={imageUrl}
          source={{ uri: imageUrl }}
          style={style.generatedImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
      <View style={style.imageActions}>
        <TouchableOpacity
          style={style.saveIcon}
          onPress={async () => {
            // Check if user has subscription
            const hasSubscription = await isUserSubscribed();
            if (!hasSubscription) {
              Alert.alert(
                'Upgrade to Pro',
                'Want to save your thumbnails? Upgrade to Pro to unlock unlimited saves and access your history across devices.',
                [
                  { text: 'Maybe Later', style: 'cancel' },
                  { text: 'Upgrade to Pro', style: 'default' }
                ]
              );
              return;
            }

            try {
              await saveThumbnail(prompt, imageUrl, null);
              Alert.alert('Saved!', 'Thumbnail saved to your history');
            } catch (error) {
              console.error('Save error:', error);
              Alert.alert('Error', 'Failed to save thumbnail');
            }
          }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
              fill="#ffffff"
            />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity
          style={style.downloadIcon}
          onPress={downloadThumbnail}
        >
          <Text style={style.downloadArrow}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={style.editButton}
          onPress={onEdit}
        >
          <Text style={style.editText}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}