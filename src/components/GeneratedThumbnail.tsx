import { View, TouchableOpacity, Image, Text, Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { saveThumbnail } from '../utils/thumbnailStorage';
import Svg, { Path } from 'react-native-svg';

interface GeneratedThumbnailProps {
  imageUrl: string;
  prompt: string;
  onEdit: () => void;
  style: any;
  edits?: {
    drawings: Array<{id: string, path: string, color: string}>;
    text: {text: string, x: number, y: number, fontSize: number} | null;
  } | null;
}

export default function GeneratedThumbnail({ imageUrl, prompt, onEdit, style, edits }: GeneratedThumbnailProps) {
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
        <View style={{ position: 'relative' }}>
          <Image
            key={imageUrl}
            source={{ uri: imageUrl }}
            style={style.generatedImage}
            resizeMode="contain"
          />

          {/* Render edits overlay */}
          {edits && (
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none'
            }}>
              {/* Drawings overlay */}
              {edits.drawings.length > 0 && (
                <Svg style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%'
                }}>
                  {edits.drawings.map((drawing) => (
                    <Path
                      key={drawing.id}
                      d={drawing.path}
                      stroke={drawing.color}
                      strokeWidth="3"
                      fill="transparent"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
              )}

              {/* Text overlay */}
              {edits.text && (
                <Text
                  style={{
                    position: 'absolute',
                    left: edits.text.x,
                    top: edits.text.y,
                    fontSize: edits.text.fontSize,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    transform: [{ translateX: -50 }, { translateY: -15 }],
                  }}
                >
                  {edits.text.text}
                </Text>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View style={style.imageActions}>
        <TouchableOpacity
          style={style.saveIcon}
          onPress={async () => {
            // Check if user is in guest mode
            if (global?.isGuestMode) {
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
              await saveThumbnail(prompt, imageUrl, edits);
              Alert.alert('Saved!', 'Thumbnail saved to your history');
            } catch (error) {
              console.error('Save error:', error);
              Alert.alert('Error', 'Failed to save thumbnail');
            }
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