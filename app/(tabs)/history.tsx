import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import ThumbnailCard from '../../src/components/ThumbnailCard';
import { getSavedThumbnails, deleteSavedThumbnail, SavedThumbnail } from '../../src/utils/thumbnailStorage';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

export default function HistoryScreen() {
  const [thumbnails, setThumbnails] = useState<SavedThumbnail[]>([]);
  const [filter, setFilter] = useState<'all' | 'saved'>('all');

  useEffect(() => {
    loadThumbnails();
  }, []);

  // Refresh data when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadThumbnails();
    }, [])
  );

  const loadThumbnails = async () => {
    try {
      const savedThumbnails = await getSavedThumbnails();
      setThumbnails(savedThumbnails);
    } catch (error) {
      console.error('Error loading thumbnails:', error);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      // Find the thumbnail
      const thumbnail = thumbnails.find(t => t.id === id);
      if (!thumbnail || !thumbnail.imageUrl) {
        Alert.alert('Error', 'Thumbnail not found');
        return;
      }

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need permission to save images to your photo library');
        return;
      }

      // Download the image to a temporary location
      const fileUri = FileSystem.documentDirectory + `thumbnail_${id}.jpg`;
      const downloadResult = await FileSystem.downloadAsync(thumbnail.imageUrl, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download image');
      }

      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      await MediaLibrary.createAlbumAsync('Thumbnails', asset, false);

      Alert.alert('Success', 'Thumbnail saved to your photo library!');
    } catch (error) {
      console.error('Error downloading thumbnail:', error);
      Alert.alert('Error', 'Failed to save thumbnail to photo library');
    }
  };

  const handleShare = async (id: string) => {
    try {
      const thumbnail = thumbnails.find(t => t.id === id);
      if (!thumbnail) {
        Alert.alert('Error', 'Thumbnail not found');
        return;
      }

      // App Store URL - will be updated once app is published
      const appStoreUrl = 'https://apps.apple.com/app/youtube-thumbnail-generator/id[YOUR_APP_ID]';
      const shareMessage = `Check out this thumbnail I created with YouTube Thumbnail Generator!\n\nDownload the app: ${appStoreUrl}`;

      const result = await Share.share(
        {
          message: shareMessage,
          url: thumbnail.imageUrl, // iOS will include the image
        },
        {
          subject: 'Check out my thumbnail!', // For email sharing
          dialogTitle: 'Share Thumbnail', // Android only
        }
      );

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // Shared with activity type (iOS)
          console.log('Shared with activity:', result.activityType);
        } else {
          // Shared (Android or iOS without activity type)
          console.log('Thumbnail shared successfully');
        }
      } else if (result.action === Share.dismissedAction) {
        // Dismissed
        console.log('Share dialog dismissed');
      }
    } catch (error) {
      console.error('Error sharing thumbnail:', error);
      Alert.alert('Error', 'Failed to share thumbnail');
    }
  };

  const handleFavorite = async (id: string) => {
    try {
      const existingThumbnails = await getSavedThumbnails();
      const updatedThumbnails = existingThumbnails.map(thumb =>
        thumb.id === id ? { ...thumb, isFavorited: !thumb.isFavorited } : thumb
      );

      // Save back to storage
      await require('../../src/utils/thumbnailStorage').default;
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('saved_thumbnails', JSON.stringify(updatedThumbnails));

      // Update local state
      setThumbnails(updatedThumbnails);

      const thumbnail = updatedThumbnails.find(t => t.id === id);
      Alert.alert('Success', thumbnail?.isFavorited ? 'Added to saved' : 'Removed from saved');
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'Failed to update thumbnail');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Delete Thumbnail',
      'Are you sure you want to delete this thumbnail?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavedThumbnail(id);
              setThumbnails(prev => prev.filter(thumb => thumb.id !== id));
            } catch (error) {
              console.error('Error deleting thumbnail:', error);
              Alert.alert('Error', 'Failed to delete thumbnail');
            }
          }
        }
      ]
    );
  };


  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Thumbnail History</Text>
        <Text style={styles.subtitle}>Track your generated content</Text>

        <View style={styles.filterSection}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.activeFilter]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'saved' && styles.activeFilter]}
            onPress={() => setFilter('saved')}
          >
            <Text style={[styles.filterText, filter === 'saved' && styles.activeFilterText]}>Saved</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.videoList}>
          {(() => {
            let filteredThumbnails = thumbnails;

            if (filter === 'saved') {
              filteredThumbnails = thumbnails.filter(t => t.isFavorited);
            } else if (filter === 'all') {
              // Limit "All" section to 5 most recent thumbnails
              filteredThumbnails = thumbnails.slice(0, 5);
            }

            return filteredThumbnails.length > 0 ? (
              filteredThumbnails.map((thumbnail) => (
              <ThumbnailCard
                key={thumbnail.id}
                id={thumbnail.id}
                title={thumbnail.title}
                date={thumbnail.date}
                status={thumbnail.status}
                imageUrl={thumbnail.imageUrl}
                isFavorited={thumbnail.isFavorited}
                edits={thumbnail.edits}
                onDownload={() => handleDownload(thumbnail.id)}
                onShare={() => handleShare(thumbnail.id)}
                onFavorite={() => handleFavorite(thumbnail.id)}
                onDelete={() => handleDelete(thumbnail.id)}
              />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {filter === 'saved' ? 'No saved thumbnails' : 'No thumbnails'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {filter === 'saved'
                    ? 'Click the heart icon on thumbnails to save them'
                    : 'Generate and save thumbnails to see them here'
                  }
                </Text>
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </View>
  );
}

const BG = '#0b0f14';
const CARD = '#151a21';
const BORDER = '#232932';
const TEXT = '#e7ebf0';
const MUTED = '#8a9099';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: MUTED,
    marginBottom: 24,
  },
  filterSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  activeFilter: {
    backgroundColor: '#2a3038',
    borderColor: '#2a3038',
  },
  filterText: {
    fontSize: 14,
    color: MUTED,
  },
  activeFilterText: {
    color: TEXT,
  },
  videoList: {
    gap: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
});