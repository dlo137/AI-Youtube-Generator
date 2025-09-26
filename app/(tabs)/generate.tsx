import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, KeyboardAvoidingView, Keyboard, Animated, Image, Modal, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { PinchGestureHandler, PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../lib/supabase';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import GeneratedThumbnail from '../../src/components/GeneratedThumbnail';
import { saveThumbnail } from '../../src/utils/thumbnailStorage';

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
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [selectedTool, setSelectedTool] = useState<'save' | 'draw' | 'text' | null>(null);
  const [drawingPaths, setDrawingPaths] = useState<Array<{id: string, path: string, color: string}>>([]);
  const [currentPath, setCurrentPath] = useState('');
  const pathRef = useRef('');
  const [textElements, setTextElements] = useState<Array<{id: string, text: string, x: number, y: number, color: string, fontSize: number}>>([]);
  const [isAddingText, setIsAddingText] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const scaleValue = useRef(new Animated.Value(1));
  const translateXValue = useRef(new Animated.Value(0));
  const translateYValue = useRef(new Animated.Value(0));
  const [lastPrompt, setLastPrompt] = useState('');
  const [allGenerations, setAllGenerations] = useState<Array<{
    id: string;
    prompt: string;
    url1: string;
    url2?: string;
    timestamp: number;
  }>>([]);
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
      const docDir = (FileSystem as any).documentDirectory;
      if (!docDir) {
        throw new Error('Document directory not available');
      }
      const localUri = `${docDir}${filename}`;

      console.log('Downloading image from:', generatedImageUrl);
      console.log('Saving to local path:', localUri);

      const { uri } = await (FileSystem as any).downloadAsync(generatedImageUrl, localUri);

      // Save to photo library
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('AI Thumbnails', asset, false);

      Alert.alert('Success', 'Thumbnail saved to your photo library!');

    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to save thumbnail. Please try again.');
    }
  };

  const openModal = (imageUrl: string) => {
    setModalPrompt('');
    setModalImageUrl(imageUrl);
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setModalPrompt('');
    setModalImageUrl('');
    setSelectedTool(null);
    setDrawingPaths([]);
    setCurrentPath('');
    pathRef.current = '';
    setTextElements([]);
    setIsAddingText(false);
    setSelectedTextId(null);
    // Reset zoom and pan
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    scaleValue.current.setValue(1);
    translateXValue.current.setValue(0);
    translateYValue.current.setValue(0);
  };

  const getShortTitle = (prompt: string) => {
    // Extract key words and create a 2-3 word title
    const words = prompt.toLowerCase().split(' ').filter(word =>
      word.length > 2 &&
      !['the', 'and', 'for', 'with', 'about', 'thumbnail', 'image', 'picture'].includes(word)
    );
    return words.slice(0, 3).map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const handleTextPlacement = (event: any) => {
    if (selectedTool !== 'text') return;

    const { locationX, locationY } = event.nativeEvent;

    Alert.prompt(
      'Add Text',
      'Enter your text:',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Add',
          onPress: (userText) => {
            if (userText && userText.trim()) {
              const newTextElement = {
                id: Date.now().toString(),
                text: userText.trim(),
                x: locationX,
                y: locationY,
                color: '#FFD700', // Yellow color
                fontSize: 16
              };
              setTextElements(prev => [...prev, newTextElement]);
              setSelectedTextId(newTextElement.id); // Auto-select the new text
            }
            setSelectedTool(null); // Deselect text tool after placing text
          },
        },
      ],
      'plain-text',
      '', // Default text
      'default'
    );
  };

  const handleTextSelection = (textId: string) => {
    setSelectedTextId(selectedTextId === textId ? null : textId);
  };

  const moveText = (textId: string, deltaX: number, deltaY: number) => {
    setTextElements(prev => prev.map(text =>
      text.id === textId
        ? { ...text, x: text.x + deltaX, y: text.y + deltaY }
        : text
    ));
  };

  const resizeText = (textId: string, scale: number) => {
    setTextElements(prev => prev.map(text =>
      text.id === textId
        ? { ...text, fontSize: Math.max(12, Math.min(48, text.fontSize * scale)) }
        : text
    ));
  };

  const onPinchGestureEvent = (event: any) => {
    const { scale: newScale } = event.nativeEvent;
    const clampedScale = Math.max(0.5, Math.min(newScale, 3)); // Min 0.5x, Max 3x
    scaleValue.current.setValue(clampedScale);
  };

  const onPinchHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { scale: newScale } = event.nativeEvent;
      const clampedScale = Math.max(0.5, Math.min(newScale, 3));
      setScale(clampedScale);
      scaleValue.current.setValue(clampedScale);
    }
  };

  const onPanGestureEvent = (event: any) => {
    if (selectedTool !== 'draw' && scale > 1) {
      const { translationX, translationY } = event.nativeEvent;
      translateXValue.current.setValue(translationX);
      translateYValue.current.setValue(translationY);
    }
  };

  const onPanHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END && selectedTool !== 'draw' && scale > 1) {
      const { translationX, translationY } = event.nativeEvent;
      setTranslateX(prev => prev + translationX);
      setTranslateY(prev => prev + translationY);
      translateXValue.current.setOffset(translateX + translationX);
      translateYValue.current.setOffset(translateY + translationY);
      translateXValue.current.setValue(0);
      translateYValue.current.setValue(0);
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => selectedTool === 'draw',
    onMoveShouldSetPanResponder: () => selectedTool === 'draw',
    onStartShouldSetPanResponderCapture: () => selectedTool === 'draw',
    onMoveShouldSetPanResponderCapture: () => selectedTool === 'draw',
    onPanResponderTerminationRequest: () => false, // Don't allow termination
    onShouldBlockNativeResponder: () => true, // Block native responder

    onPanResponderGrant: (evt) => {
      console.log('PanResponder Grant - selectedTool:', selectedTool);
      if (selectedTool !== 'draw') return;
      const { locationX, locationY } = evt.nativeEvent;
      console.log('Drawing started at:', locationX, locationY);
      const newPath = `M${locationX.toFixed(2)},${locationY.toFixed(2)}`;
      pathRef.current = newPath;
      setCurrentPath(newPath);
    },

    onPanResponderMove: (evt) => {
      if (selectedTool !== 'draw') return;
      const { locationX, locationY } = evt.nativeEvent;
      console.log('Drawing move to:', locationX, locationY);
      const updatedPath = `${pathRef.current} L${locationX.toFixed(2)},${locationY.toFixed(2)}`;
      pathRef.current = updatedPath;
      setCurrentPath(updatedPath); on
    },

    onPanResponderRelease: () => {
      console.log('Drawing released');
      if (selectedTool !== 'draw' || !pathRef.current) return;
      const newDrawingPath = {
        id: Date.now().toString(),
        path: pathRef.current,
        color: '#FFD700' // Yellow color
      };
      setDrawingPaths(prev => [...prev, newDrawingPath]);
      setCurrentPath('');
      pathRef.current = '';
    },

    onPanResponderTerminate: () => {
      console.log('Drawing terminated');
      // Handle forced termination - save current path
      if (selectedTool === 'draw' && pathRef.current) {
        const newDrawingPath = {
          id: Date.now().toString(),
          path: pathRef.current,
          color: '#FFD700'
        };
        setDrawingPaths(prev => [...prev, newDrawingPath]);
        setCurrentPath('');
        pathRef.current = '';
      }
    },
  });

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

    // Store the prompt for title display BEFORE clearing
    const promptToUse = topic.trim();
    setLastPrompt(promptToUse);

    // Dismiss keyboard when generating
    Keyboard.dismiss();
    setIsLoading(true);

    // Clear the input field
    setTopic('');

    try {

      // Call your Supabase edge function
      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: {
          prompt: promptToUse,
          style: style,
        },
      });


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
        const url1 = data.variation1?.imageUrl;
        const url2 = data.variation2?.imageUrl;

        if (url1) {
          setGeneratedImageUrl(url1);
        }
        if (url2) {
          setGeneratedImageUrl2(url2);
        }

        // Add to all generations list
        const newGeneration = {
          id: Date.now().toString(),
          prompt: promptToUse,
          url1: url1 || '',
          url2: url2,
          timestamp: Date.now(),
        };
        setAllGenerations(prev => [newGeneration, ...prev]);
      } else if (data?.imageUrl) {
        // Fallback for backwards compatibility
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

        {/* Display all generated images or hero text */}
        {allGenerations.length > 0 ? (
          <View style={styles.generationsContainer}>
            {/* All generations including current one */}
            {allGenerations.map((generation, index) => (
              <View key={generation.id} style={styles.generationSection}>
                {/* Title for each generation */}
                <Text style={styles.imageTitle}>{getShortTitle(generation.prompt)}</Text>

                {/* First Generated Image */}
                {generation.url1 && (
                  <GeneratedThumbnail
                    key={`${generation.id}-1`}
                    imageUrl={generation.url1}
                    prompt={generation.prompt}
                    onEdit={() => openModal(generation.url1)}
                    style={styles}
                  />
                )}

                {/* Second Generated Image - Different Variation */}
                {generation.url2 && (
                  <GeneratedThumbnail
                    key={`${generation.id}-2`}
                    imageUrl={generation.url2}
                    prompt={generation.prompt}
                    onEdit={() => openModal(generation.url2)}
                    style={styles}
                  />
                )}

                {/* Add separator between generations (except for the last one) */}
                {index < allGenerations.length - 1 && (
                  <View style={styles.generationSeparator} />
                )}
              </View>
            ))}
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
        <View style={{ height: 225 }} />
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
        animationType="none"
        presentationStyle="overFullScreen"
        supportedOrientations={['portrait']}
        onRequestClose={() => {}} // Prevent back button/gesture close
        hardwareAccelerated={true}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={[
            styles.modalContainer,
            {
              overflow: 'hidden',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              // Disable scroll when drawing
              ...(selectedTool === 'draw' && {
                pointerEvents: 'box-none'
              })
            }
          ]}>
          {/* Header with X icon */}
          <View style={[styles.modalHeader, { paddingTop: 50 }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeModal}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Generated Image in the middle */}
          <View style={[
            styles.modalContent,
            // Prevent scroll interference when drawing
            selectedTool === 'draw' && { pointerEvents: 'box-none' }
          ]}>
            <View style={styles.imageWithDrawing}>
              <PinchGestureHandler
                onGestureEvent={onPinchGestureEvent}
                onHandlerStateChange={onPinchHandlerStateChange}
                enabled={selectedTool !== 'draw' && selectedTool !== 'text'}
              >
                <PanGestureHandler
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanHandlerStateChange}
                  enabled={selectedTool !== 'draw' && selectedTool !== 'text'}
                >
                  <Animated.View
                    style={[
                      styles.modalImageContainer,
                      {
                        transform: [
                          { scale: scaleValue.current },
                          { translateX: translateXValue.current },
                          { translateY: translateYValue.current },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: modalImageUrl }}
                      style={styles.modalImage}
                      resizeMode="contain"
                    />

                    {/* Persistent drawings overlay - always show completed drawings */}
                    <View style={styles.persistentDrawingsOverlay} pointerEvents="none">
                      <Svg style={StyleSheet.absoluteFillObject}>
                        {drawingPaths.map((drawing) => (
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
                    </View>

                    {/* Text elements overlay - only when not drawing */}
                    {selectedTool !== 'draw' && textElements.map((textEl) => {
                      const isSelected = selectedTextId === textEl.id;
                      return (
                        <PinchGestureHandler
                          key={`pinch-${textEl.id}`}
                          onGestureEvent={(event) => {
                            if (isSelected) {
                              const scale = event.nativeEvent.scale;
                              resizeText(textEl.id, scale);
                            }
                          }}
                          enabled={isSelected}
                        >
                          <PanGestureHandler
                            key={`pan-${textEl.id}`}
                            onGestureEvent={(event) => {
                              if (isSelected) {
                                const { translationX, translationY } = event.nativeEvent;
                                moveText(textEl.id, translationX * 0.02, translationY * 0.02);
                              }
                            }}
                            enabled={isSelected}
                          >
                            <View
                              style={[
                                styles.textElement,
                                {
                                  left: textEl.x - 50,
                                  top: textEl.y - 15,
                                  borderWidth: isSelected ? 2 : 0,
                                  borderColor: isSelected ? '#FFD700' : 'transparent',
                                  borderStyle: 'dashed',
                                  padding: isSelected ? 8 : 0,
                                }
                              ]}
                            >
                              <TouchableOpacity
                                onPress={() => handleTextSelection(textEl.id)}
                                activeOpacity={0.7}
                              >
                                <Text style={[
                                  styles.textElementText,
                                  { fontSize: textEl.fontSize }
                                ]}>
                                  {textEl.text}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </PanGestureHandler>
                        </PinchGestureHandler>
                      );
                    })}
                  </Animated.View>
                </PanGestureHandler>
              </PinchGestureHandler>

              {/* Active drawing overlay - only when drawing */}
              {selectedTool === 'draw' && (
                <View
                  style={[styles.drawingOverlay, { zIndex: 1000 }]}
                  {...panResponder.panHandlers}
                  pointerEvents="auto"
                >
                  <Svg style={StyleSheet.absoluteFillObject}>
                    {/* Only show the current path being drawn */}
                    {currentPath !== '' && (
                      <Path
                        d={currentPath}
                        stroke="#FFD700"
                        strokeWidth="3"
                        fill="transparent"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </Svg>
                </View>
              )}

              {/* Text placement overlay - only when text tool active */}
              {selectedTool === 'text' && (
                <View
                  style={styles.drawingOverlay}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={handleTextPlacement}
                >
                  {/* Centered "Enter text" placeholder */}
                  <View style={styles.textPlaceholder}>
                    <Text style={styles.textPlaceholderText}>Enter text</Text>
                  </View>

                  {textElements.map((textEl) => (
                    <View
                      key={textEl.id}
                      style={[
                        styles.textElement,
                        {
                          left: textEl.x - 50,
                          top: textEl.y - 15,
                        }
                      ]}
                    >
                      <Text style={[styles.textElementText, { fontSize: textEl.fontSize }]}>
                        {textEl.text}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Edit Tools */}
            <View style={styles.editTools}>
              <TouchableOpacity
                style={[
                  styles.editToolIcon,
                  selectedTool === 'draw' && styles.editToolIconSelected
                ]}
                onPress={() => {
                  setSelectedTool(selectedTool === 'draw' ? null : 'draw');
                }}
              >
                <Text style={styles.editToolText}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editToolIcon,
                  selectedTool === 'text' && styles.editToolIconSelected
                ]}
                onPress={() => {
                  setSelectedTool(selectedTool === 'text' ? null : 'text');
                }}
              >
                <Text style={styles.editToolText}>Aa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editToolIcon}
                onPress={() => {
                  setDrawingPaths([]);
                  setCurrentPath('');
                  pathRef.current = '';
                  setTextElements([]);
                  Alert.alert('Erased', 'All edits cleared!');
                }}
              >
                <Text style={styles.editToolText}>↻</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editToolIcon,
                  selectedTool === 'save' && styles.editToolIconSelected
                ]}
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
                    // Find the generation that matches the current modal image
                    const currentGeneration = allGenerations.find(gen =>
                      gen.url1 === modalImageUrl || gen.url2 === modalImageUrl
                    );

                    if (currentGeneration) {
                      await saveThumbnail(currentGeneration.prompt, modalImageUrl);
                      Alert.alert('Saved!', 'Thumbnail saved to your history');
                    } else {
                      Alert.alert('Error', 'Could not find thumbnail to save');
                    }
                  } catch (error) {
                    console.error('Save error:', error);
                    Alert.alert('Error', 'Failed to save thumbnail');
                  }
                }}
              >
                <Text style={styles.editToolText}>♡</Text>
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
        </GestureHandlerRootView>
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
    textAlignVertical: 'center',
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
  generationsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  generationSection: {
    marginBottom: 20,
  },
  generationSeparator: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 30,
  },
  imageTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'left',
    alignSelf: 'flex-start',
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
  saveIcon: {
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
  saveArrow: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
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
  modalImageContainer: {
    width: '100%',
    height: 250,
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
  editToolIconSelected: {
    borderWidth: 3,
    borderColor: '#FFD700', // Yellow border when selected
  },
  imageWithDrawing: {
    position: 'relative',
    width: '100%',
    height: 250,
  },
  drawingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  persistentDrawingsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  textElement: {
    position: 'absolute',
    alignItems: 'center',
  },
  textElementText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#ffffff',
  },
  textPlaceholder: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -15 }],
    borderWidth: 2,
    borderColor: '#ffffff',
    borderStyle: 'dashed',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
  },
  textPlaceholderText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});