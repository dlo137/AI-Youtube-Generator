import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedThumbnail {
  id: string;
  title: string;
  prompt: string;
  imageUrl: string;
  date: string;
  status: 'completed' | 'processing' | 'failed';
  timestamp: number;
  edits?: {
    drawings: Array<{id: string, path: string, color: string}>;
    text: {text: string, x: number, y: number, fontSize: number} | null;
  } | null;
}

const STORAGE_KEY = 'saved_thumbnails';

export const saveThumbnail = async (
  prompt: string,
  imageUrl: string,
  edits?: {
    drawings: Array<{id: string, path: string, color: string}>;
    text: {text: string, x: number, y: number, fontSize: number} | null;
  } | null
): Promise<SavedThumbnail> => {
  try {
    const existingThumbnails = await getSavedThumbnails();

    const newThumbnail: SavedThumbnail = {
      id: Date.now().toString(),
      title: generateTitle(prompt),
      prompt,
      imageUrl,
      date: new Date().toISOString().split('T')[0],
      status: 'completed',
      timestamp: Date.now(),
      edits: edits || null,
    };

    const updatedThumbnails = [newThumbnail, ...existingThumbnails];

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedThumbnails));

    return newThumbnail;
  } catch (error) {
    console.error('Error saving thumbnail:', error);
    throw error;
  }
};

export const getSavedThumbnails = async (): Promise<SavedThumbnail[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error getting saved thumbnails:', error);
    return [];
  }
};

export const deleteSavedThumbnail = async (id: string): Promise<void> => {
  try {
    const existingThumbnails = await getSavedThumbnails();
    const updatedThumbnails = existingThumbnails.filter(thumb => thumb.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedThumbnails));
  } catch (error) {
    console.error('Error deleting thumbnail:', error);
    throw error;
  }
};

const generateTitle = (prompt: string): string => {
  // Extract key words and create a 2-3 word title
  const words = prompt.toLowerCase().split(' ').filter(word =>
    word.length > 2 &&
    !['the', 'and', 'for', 'with', 'about', 'thumbnail', 'image', 'picture'].includes(word)
  );
  return words.slice(0, 3).map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};