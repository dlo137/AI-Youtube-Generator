import { View, TouchableOpacity, Image, Text, Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

interface GeneratedThumbnailProps {
  imageUrl: string;
  onEdit: () => void;
  style: any;
}

export default function GeneratedThumbnail({ imageUrl, onEdit, style }: GeneratedThumbnailProps) {
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
          resizeMode="contain"
        />
      </TouchableOpacity>
      <View style={style.imageActions}>
        <TouchableOpacity
          style={style.saveIcon}
          onPress={() => {
            // Save functionality can be added here
            Alert.alert('Save', 'Save functionality coming soon!');
          }}
        >
          <Text style={style.saveArrow}>♡</Text>
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