import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, KeyboardAvoidingView, Keyboard, Animated, Image, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

export default function GenerateScreen() {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(''); // kept for existing logic
  const [style, setStyle] = useState('educational'); // kept for existing logic
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [generatedImageUrl2, setGeneratedImageUrl2] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalPrompt, setModalPrompt] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowListener = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });

    const keyboardHideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  const downloadThumbnail = async () => {
    if (!generatedImageUrl) {
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
      const localUri = `${FileSystem.documentDirectory}${filename}`;

      console.log('Downloading image from:', generatedImageUrl);
      console.log('Saving to local path:', localUri);

      const { uri } = await FileSystem.downloadAsync(generatedImageUrl, localUri);

      // Save to photo library
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('AI Thumbnails', asset, false);

      Alert.alert('Success', 'Thumbnail saved to your photo library!');

    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to save thumbnail. Please try again.');
    }
  };

  const openModal = () => {
    setModalPrompt('');
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setModalPrompt('');
  };

  // kept from original for backwards-compat; do not change functionality
  const thumbnailStyles = [
    { id: 'minimal', label: 'Minimal' },
    { id: 'bold', label: 'Bold & Vibrant' },
    { id: 'retro', label: 'Retro' },
    { id: 'modern', label: 'Modern' },
    { id: 'cinematic', label: 'Cinematic' },
    { id: 'cartoon', label: 'Cartoon' },
    { id: 'dark', label: 'Dark Theme' },
    { id: 'colorful', label: 'Colorful' },
  ];

  const handleGenerate = async () => {
    if (!topic.trim()) {
      Alert.alert('Error', 'Please enter a description for your thumbnail');
      return;
    }

    // Dismiss keyboard when generating
    Keyboard.dismiss();
    setIsLoading(true);

    // Clear the input field
    setTopic('');

    try {
      console.log('=== GENERATION DEBUG ===');
      console.log('Prompt:', topic.trim());
      console.log('Style:', style);
      console.log('Calling Supabase function...');

      // Call your Supabase edge function
      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: {
          prompt: topic.trim(),
          style: style,
        },
      });

      console.log('=== FULL SUPABASE RESPONSE ===');
      console.log('Data keys:', data ? Object.keys(data) : 'No data');
      console.log('Data structure:', JSON.stringify(data, null, 2));
      console.log('Error:', error);
      console.log('Has imageUrl?', !!data?.imageUrl);
      console.log('Has variation1?', !!data?.variation1);
      console.log('Has variation1.imageUrl?', !!data?.variation1?.imageUrl);
      console.log('Has variation2?', !!data?.variation2);
      console.log('Has variation2.imageUrl?', !!data?.variation2?.imageUrl);
      if (data?.variation1?.imageUrl) {
        console.log('Variation1 URL:', data.variation1.imageUrl.substring(0, 100) + '...');
      }
      if (data?.variation2?.imageUrl) {
        console.log('Variation2 URL:', data.variation2.imageUrl.substring(0, 100) + '...');
      }
      console.log('===============================');

      if (error) {
        console.error('Supabase function error:', error);
        Alert.alert('Error', `Failed to generate thumbnail: ${error.message || 'Unknown error'}\n\nDetails: ${error.details || 'No details available'}`);
        return;
      }

      if (data?.error) {
        console.error('Generation error:', data.error);
        Alert.alert('Error', data.error || 'Failed to generate thumbnail');
        return;
      }

      if (data?.variation1?.imageUrl || data?.variation2?.imageUrl) {
        // Success! Display variations
        if (data.variation1?.imageUrl) {
          console.log('Generated variation 1 URL:', data.variation1.imageUrl);
          setGeneratedImageUrl(data.variation1.imageUrl);
        }
        if (data.variation2?.imageUrl) {
          console.log('Generated variation 2 URL:', data.variation2.imageUrl);
          setGeneratedImageUrl2(data.variation2.imageUrl);
        }

        // Verify state was actually set
        setTimeout(() => {
          console.log('=== STATE VERIFICATION ===');
          console.log('generatedImageUrl state:', generatedImageUrl ? 'SET' : 'EMPTY');
          console.log('generatedImageUrl2 state:', generatedImageUrl2 ? 'SET' : 'EMPTY');
        }, 100);
      } else if (data?.imageUrl) {
        // Fallback for backwards compatibility
        console.log('Generated thumbnail URL (fallback):', data.imageUrl);
        setGeneratedImageUrl(data.imageUrl);
        setGeneratedImageUrl2(''); // No second variation
      } else {
        Alert.alert('Error', 'No image was generated. Please try again.');
      }

    } catch (error) {
      console.error('Error generating thumbnail:', error);
      Alert.alert('Error', 'Something went wrong. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Display generated images or hero text */}
        {(generatedImageUrl || generatedImageUrl2) ? (
          <View style={styles.imageContainer}>
            {/* DEBUG INFO */}
            <Text style={{color: 'white', fontSize: 10, marginBottom: 10}}>
              DEBUG: URL1: {generatedImageUrl ? 'YES' : 'NO'} | URL2: {generatedImageUrl2 ? 'YES' : 'NO'}
            </Text>
            {/* First Generated Image */}
            {generatedImageUrl && (
              <View style={styles.imageWrapper}>
                <TouchableOpacity onPress={openModal} activeOpacity={0.8}>
                  <Image
                    source={{ uri: generatedImageUrl }}
                    style={styles.generatedImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={styles.downloadIcon}
                    onPress={downloadThumbnail}
                  >
                    <Text style={styles.downloadArrow}>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={openModal}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Second Generated Image - Different Variation */}
            {generatedImageUrl2 && (
              <View style={styles.imageWrapper}>
                <TouchableOpacity onPress={openModal} activeOpacity={0.8}>
                  <Image
                    source={{ uri: generatedImageUrl2 }}
                    style={styles.generatedImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={styles.downloadIcon}
                    onPress={downloadThumbnail}
                  >
                    <Text style={styles.downloadArrow}>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={openModal}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.generateNewBtn}
              onPress={() => {
                setGeneratedImageUrl('');
                setGeneratedImageUrl2('');
              }}
            >
              <Text style={styles.generateNewText}>Generate New</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>
              {isLoading ? 'Generating your thumbnail...' : 'Create your first thumbnail.'}
            </Text>
            <Text style={styles.heroSubtitle}>
              {isLoading
                ? 'This may take a few moments'
                : 'Simply type or pick one of the options below'
              }
            </Text>
          </View>
        )}

        {/* Bottom padding for fixed action cards and prompt bar */}
        <View style={{ height: 160 }} />
      </ScrollView>

      {/* Fixed Bottom Container with Action Cards and Prompt Bar */}
      <View style={[
        styles.fixedBottomContainer,
        {
          bottom: keyboardHeight > 0 ? keyboardHeight - insets.bottom : 0,
          paddingBottom: keyboardHeight > 0 ? 8 : Platform.select({ ios: 34, android: 16 }),
        }
      ]}>
        {/* Action Cards (h-scroll) - fixed at bottom */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionRow}
          style={styles.actionScrollView}
        >

          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>👤</Text></View>
            <Text style={styles.actionTitle}>Add a subject</Text>
            <Text style={styles.actionSubtitle}>Include a person or object</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>✨</Text></View>
            <Text style={styles.actionTitle}>Add a Reference</Text>
            <Text style={styles.actionSubtitle}>Inspire the design</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Prompt Bar */}
        <View style={styles.inputBar}>
          <Text style={styles.paperclip}>📎</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Describe your thumbnail idea"
            placeholderTextColor="#7b818a"
            value={topic}
            onChangeText={setTopic}
            multiline
            onSubmitEditing={handleGenerate}
            blurOnSubmit={true}
            returnKeyType="send"
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Enter' && topic.trim()) {
                handleGenerate();
              }
            }}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!topic || isLoading) && styles.sendBtnDisabled]}
            onPress={handleGenerate}
            disabled={!topic || isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendArrow}>{isLoading ? '...' : '↑'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal --- Editing Thumbnail Area */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          {/* Header with X icon */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeModal}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Generated Image in the middle */}
          <View style={styles.modalContent}>
            <Image
              source={{ uri: generatedImageUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />

            {/* Edit Tools */}
            <View style={styles.editTools}>
              <TouchableOpacity
                style={styles.editToolIcon}
                onPress={() => {
                  console.log('Drawing tool selected');
                }}
              >
                <Text style={styles.editToolText}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editToolIcon}
                onPress={() => {
                  console.log('Text tool selected');
                }}
              >
                <Text style={styles.editToolText}>T</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Prompt Bar at the bottom */}
          <View style={styles.modalPromptContainer}>
            <View style={styles.modalInputBar}>
              <Text style={styles.paperclip}>📎</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Edit your thumbnail prompt"
                placeholderTextColor="#7b818a"
                value={modalPrompt}
                onChangeText={setModalPrompt}
                multiline
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!modalPrompt) && styles.sendBtnDisabled]}
                disabled={!modalPrompt}
                activeOpacity={0.8}
              >
                <Text style={styles.sendArrow}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContainer: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingTop: Platform.select({ ios: 12, android: 16 }),
    paddingHorizontal: 18,
  },
  fixedBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
    paddingBottom: 8,
    paddingTop: 8,
  },
  actionScrollView: {
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  heroTitle: {
    color: TEXT,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    color: MUTED,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  actionRow: {
    paddingVertical: 14,
    gap: 12,
  },
  actionCard: {
    width: 220,
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    padding: 14,
    borderRadius: 16,
    marginRight: 12,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1c222b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionTitle: {
    color: TEXT,
    fontWeight: '700',
    fontSize: 16,
  },
  actionSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 6,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 18,
  },
  paperclip: {
    fontSize: 16,
    marginRight: 8,
    color: MUTED,
    textAlignVertical: 'center',
  },
  textInput: {
    flex: 1,
    color: TEXT,
    fontSize: 15,
    textAlign: 'left',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a3038',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendArrow: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '800',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  generatedImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: CARD,
  },
  generateNewBtn: {
    backgroundColor: '#2a3038',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  generateNewText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    marginBottom: 20,
  },
  downloadIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  downloadArrow: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  imageActions: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  editText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: BG,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a3038',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: TEXT,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: CARD,
  },
  modalPromptContainer: {
    paddingHorizontal: 18,
    paddingBottom: Platform.select({ ios: 34, android: 16 }),
    paddingTop: 16,
  },
  modalInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editTools: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
    paddingRight: 20,
    gap: 12,
  },
  editToolIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  editToolText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});