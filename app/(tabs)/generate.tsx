import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, KeyboardAvoidingView, Keyboard, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function GenerateScreen() {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(''); // kept for existing logic
  const [style, setStyle] = useState('educational'); // kept for existing logic
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
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
      // Call your Supabase edge function
      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: {
          prompt: topic.trim(),
          style: style,
        },
      });

      if (error) {
        console.error('Supabase function error:', error);
        Alert.alert('Error', 'Failed to generate thumbnail. Please try again.');
        return;
      }

      if (data?.error) {
        console.error('Generation error:', data.error);
        Alert.alert('Error', data.error || 'Failed to generate thumbnail');
        return;
      }

      if (data?.imageUrl) {
        // Success! You can navigate to a preview screen or show the image
        console.log('Generated thumbnail URL:', data.imageUrl);
        Alert.alert('Success!', 'Thumbnail generated successfully!');
        // TODO: Navigate to preview screen or save to thumbnails list
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

        {/* Hero - centered in available space */}
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
});