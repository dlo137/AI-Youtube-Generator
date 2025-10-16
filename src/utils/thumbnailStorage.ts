import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export interface SavedThumbnail {
  id: string;
  title: string;
  prompt: string;
  imageUrl: string;
  date: string;
  status: 'completed' | 'processing' | 'failed';
  timestamp: number;
  isFavorited: boolean;
  edits?: {
    textOverlay?: {
      text: string;
      x: number;
      y: number;
      scale: number;
      rotation: number;
    };
  } | null;
}

const STORAGE_KEY = 'saved_thumbnails';
const THUMBNAIL_DIR = `${FileSystem.documentDirectory}thumbnails/`;

// Ensure thumbnail directory exists
const ensureThumbnailDirectory = async () => {
  const dirInfo = await FileSystem.getInfoAsync(THUMBNAIL_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(THUMBNAIL_DIR, { intermediates: true });
  }
};

// Download and save image to permanent local storage
const downloadImageToLocal = async (remoteUrl: string, thumbnailId: string): Promise<string> => {
  try {
    await ensureThumbnailDirectory();

    const filename = `thumbnail_${thumbnailId}.png`;
    const localUri = `${THUMBNAIL_DIR}${filename}`;

    // Check if file already exists locally
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      console.log('Image already exists locally:', localUri);
      return localUri;
    }

    // Download the image
    console.log('Downloading image from:', remoteUrl);
    console.log('Saving to:', localUri);

    const { uri } = await FileSystem.downloadAsync(remoteUrl, localUri);
    console.log('Image downloaded successfully to:', uri);

    return uri;
  } catch (error) {
    console.error('Error downloading image to local storage:', error);
    // If download fails, return the original URL as fallback
    return remoteUrl;
  }
};

export const saveThumbnail = async (
  prompt: string,
  imageUrl: string,
  edits?: {
    textOverlay?: {
      text: string;
      x: number;
      y: number;
      scale: number;
      rotation: number;
    };
  } | null
): Promise<SavedThumbnail> => {
  try {
    const existingThumbnails = await getSavedThumbnails();

    // Generate ID first (we'll need it for download)
    const thumbnailId = Date.now().toString();

    // Check if this exact thumbnail already exists (by exact imageUrl match only)
    const existingIndex = existingThumbnails.findIndex(t =>
      t.imageUrl === imageUrl
    );

    if (existingIndex !== -1) {
      // Update existing thumbnail to be favorited
      const updatedThumbnail = {
        ...existingThumbnails[existingIndex],
        isFavorited: true,
        edits: edits,
      };

      const updatedThumbnails = [...existingThumbnails];
      updatedThumbnails[existingIndex] = updatedThumbnail;

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedThumbnails));
      return updatedThumbnail;
    }

    // Download image to permanent local storage
    const localImageUrl = await downloadImageToLocal(imageUrl, thumbnailId);

    // Create new thumbnail if it doesn't exist
    const newThumbnail: SavedThumbnail = {
      id: thumbnailId,
      title: generateTitle(prompt),
      prompt,
      imageUrl: localImageUrl, // Store local file path, not remote URL
      date: new Date().toISOString().split('T')[0],
      status: 'completed',
      timestamp: Date.now(),
      isFavorited: true,
      edits: edits,
    };

    const updatedThumbnails = [newThumbnail, ...existingThumbnails];

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedThumbnails));

    return newThumbnail;
  } catch (error) {
    console.error('Error saving thumbnail:', error);
    throw error;
  }
};

export const addThumbnailToHistory = async (
  prompt: string,
  imageUrl: string,
  edits?: {
    textOverlay?: {
      text: string;
      x: number;
      y: number;
      scale: number;
      rotation: number;
    };
  } | null
): Promise<SavedThumbnail> => {
  try {
    const existingThumbnails = await getSavedThumbnails();

    // Generate ID first (we'll need it for download)
    const thumbnailId = Date.now().toString();

    // Check if this exact URL already exists in history
    const existingIndex = existingThumbnails.findIndex(t =>
      t.imageUrl === imageUrl
    );

    if (existingIndex !== -1) {
      // This exact thumbnail already exists in history, just return it
      console.log('Thumbnail already exists in history:', imageUrl);
      return existingThumbnails[existingIndex];
    }

    // Download image to permanent local storage
    const localImageUrl = await downloadImageToLocal(imageUrl, thumbnailId);

    const newThumbnail: SavedThumbnail = {
      id: thumbnailId,
      title: generateTitle(prompt),
      prompt,
      imageUrl: localImageUrl, // Store local file path, not remote URL
      date: new Date().toISOString().split('T')[0],
      status: 'completed',
      timestamp: Date.now(),
      isFavorited: false, // Not favorited by default for history
      edits: edits,
    };

    const updatedThumbnails = [newThumbnail, ...existingThumbnails];

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedThumbnails));

    console.log('Added new thumbnail to history:', thumbnailId, localImageUrl);
    return newThumbnail;
  } catch (error) {
    console.error('Error adding thumbnail to history:', error);
    throw error;
  }
};

export const getSavedThumbnails = async (): Promise<SavedThumbnail[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const thumbnails = stored ? JSON.parse(stored) : [];
    // Sort by timestamp descending (most recent first)
    return thumbnails.sort((a: SavedThumbnail, b: SavedThumbnail) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error getting saved thumbnails:', error);
    return [];
  }
};

export const deleteSavedThumbnail = async (id: string): Promise<void> => {
  try {
    const existingThumbnails = await getSavedThumbnails();
    const thumbnailToDelete = existingThumbnails.find(thumb => thumb.id === id);

    // Delete the local image file if it exists
    if (thumbnailToDelete && thumbnailToDelete.imageUrl.startsWith('file://')) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(thumbnailToDelete.imageUrl);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(thumbnailToDelete.imageUrl);
          console.log('Deleted local image file:', thumbnailToDelete.imageUrl);
        }
      } catch (fileError) {
        console.error('Error deleting local image file:', fileError);
        // Continue with deleting from storage even if file deletion fails
      }
    }

    const updatedThumbnails = existingThumbnails.filter(thumb => thumb.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedThumbnails));
  } catch (error) {
    console.error('Error deleting thumbnail:', error);
    throw error;
  }
};

const generateTitle = (prompt: string): string => {
  // Clean and normalize the prompt
  const cleanPrompt = prompt
    .replace(/[.,!?;:]/g, '') // Remove punctuation
    .trim();

  const wordCount = cleanPrompt.split(/\s+/).length;

  // If prompt is 2-3 words, just capitalize and use as is
  if (wordCount <= 3) {
    return cleanPrompt.split(/\s+/).map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  // For longer prompts, summarize
  const lowerPrompt = cleanPrompt.toLowerCase();

  // Stop words to filter out
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'about', 'thumbnail', 'image', 'picture',
    'create', 'make', 'generate', 'show', 'display', 'featuring', 'youtube',
    'that', 'this', 'has', 'have', 'are', 'was', 'were', 'been', 'being',
    'a', 'an', 'of', 'in', 'on', 'at', 'to', 'from', 'by', 'as'
  ]);

  // Split into words and filter
  const words = lowerPrompt.split(/\s+/).filter(word =>
    word.length > 2 && !stopWords.has(word)
  );

  // Remove duplicate consecutive words (e.g., "gamer vs gamer" -> "gamer vs")
  const uniqueWords = words.filter((word, index) =>
    index === 0 || word !== words[index - 1]
  );

  // Take first 3-4 unique words for title
  const titleWords = uniqueWords.slice(0, 4);

  // Capitalize each word properly
  const title = titleWords.map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  // If title is too short after filtering, use first few words of original prompt
  if (title.length < 5) {
    const fallbackWords = lowerPrompt.split(/\s+/).slice(0, 3);
    return fallbackWords.map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  return title;
};