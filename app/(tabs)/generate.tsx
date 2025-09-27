import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, KeyboardAvoidingView, Keyboard, Animated, Image, Modal, PanResponder, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { PinchGestureHandler, PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../lib/supabase';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import GeneratedThumbnail from '../../src/components/GeneratedThumbnail';
import { saveThumbnail } from '../../src/utils/thumbnailStorage';

// Utility function to upload image to Supabase Storage
const uploadImageToStorage = async (imageUri: string, fileName: string): Promise<string | null> => {
  try {
    // Create a unique filename
    const fileExt = imageUri.split('.').pop() || 'jpg';
    const uniqueFileName = `${fileName}_${Date.now()}.${fileExt}`;

    // Create FormData with the image file
    const formData = new FormData();

    // In React Native, we can append the image directly from the URI
    formData.append('file', {
      uri: imageUri,
      name: uniqueFileName,
      type: `image/${fileExt}`,
    } as any);

    // Get auth headers for Supabase
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token;

    // Upload directly to Supabase Storage using fetch
    const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/thumbnails/${uniqueFileName}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', errorText);
      return null;
    }

    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('thumbnails')
      .createSignedUrl(uniqueFileName, 3600); // 1 hour expiry

    return urlData?.signedUrl || null;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
};

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
  const [placeholderText, setPlaceholderText] = useState('Enter text');
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const [textSize, setTextSize] = useState(16);
  const [finalTextElement, setFinalTextElement] = useState<{text: string, x: number, y: number, fontSize: number} | null>(null);
  const [isScalingFinalText, setIsScalingFinalText] = useState(false);
  const [isSubjectModalVisible, setIsSubjectModalVisible] = useState(false);
  const [isReferenceModalVisible, setIsReferenceModalVisible] = useState(false);
  const [subjectImage, setSubjectImage] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [subjectImageUrl, setSubjectImageUrl] = useState<string | null>(null);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [thumbnailEdits, setThumbnailEdits] = useState<{
    imageUrl: string;
    drawings: Array<{id: string, path: string, color: string}>;
    text: {text: string, x: number, y: number, fontSize: number} | null;
  } | null>(null);
  const textTranslateXValue = useRef(new Animated.Value(0));
  const textTranslateYValue = useRef(new Animated.Value(0));
  const textScaleValue = useRef(new Animated.Value(1));
  const finalTextTranslateX = useRef(new Animated.Value(0));
  const finalTextTranslateY = useRef(new Animated.Value(0));
  const finalTextScaleValue = useRef(new Animated.Value(1));
  const [scale, setScale] = useState(1);
  const [modalKeyboardHeight, setModalKeyboardHeight] = useState(0);
  const [isModalGenerating, setIsModalGenerating] = useState(false);
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
      if (isModalVisible) {
        setModalKeyboardHeight(event.endCoordinates.height);
      } else {
        setKeyboardHeight(event.endCoordinates.height);
      }
    });

    const keyboardHideListener = Keyboard.addListener(hideEvent, () => {
      if (isModalVisible) {
        setModalKeyboardHeight(0);
      } else {
        setKeyboardHeight(0);
      }
    });

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, [isModalVisible]);


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

    // Initialize or load existing edits for this image
    if (!thumbnailEdits || thumbnailEdits.imageUrl !== imageUrl) {
      setThumbnailEdits({
        imageUrl,
        drawings: [],
        text: null
      });
      // Reset modal edit states
      setDrawingPaths([]);
      setFinalTextElement(null);
    } else {
      // Load existing edits into modal edit states
      setDrawingPaths(thumbnailEdits.drawings);
      setFinalTextElement(thumbnailEdits.text);
    }
  };

  const handleModalGenerate = async () => {
    if (!modalPrompt.trim()) {
      Alert.alert('Error', 'Please enter a description for your adjustment');
      return;
    }

    setIsModalGenerating(true);
    Keyboard.dismiss();

    try {
      // Find the current generation to get the original prompt
      const currentGeneration = allGenerations.find(gen =>
        gen.url1 === modalImageUrl || gen.url2 === modalImageUrl
      );

      if (!currentGeneration) {
        Alert.alert('Error', 'Could not find original thumbnail');
        return;
      }

      // Create edit-aware prompt
      let enhancedPrompt = modalPrompt.trim();

      // Check if user has made edits and enhance the prompt accordingly
      const hasDrawings = thumbnailEdits?.drawings?.length > 0;
      const hasText = thumbnailEdits?.text?.text;

      if (hasDrawings || hasText) {
        enhancedPrompt += '. Note: This thumbnail has been edited with';
        if (hasDrawings) {
          enhancedPrompt += ' hand-drawn elements';
        }
        if (hasText) {
          enhancedPrompt += hasDrawings ? ' and' : '';
          enhancedPrompt += ` text saying "${hasText}"`;
        }
        enhancedPrompt += '. Please consider these edits when making adjustments.';
      }

      // Create an adjustment-focused prompt that preserves the original image
      const fullPrompt = `Keep the exact same composition, layout, and core elements from this thumbnail: "${currentGeneration.prompt}". Only make this specific adjustment: ${enhancedPrompt}. Do not change the overall design, just modify the requested aspect while maintaining everything else identical.`;

      // Only use images that are actively selected for adjustment mode
      const activeSubjectImageUrl = subjectImage ? subjectImageUrl : null;
      const activeReferenceImageUrls = referenceImages.length > 0 ? referenceImageUrls : [];

      // Call the generation API with the current image as reference
      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: {
          prompt: fullPrompt,
          style: style,
          baseImageUrl: modalImageUrl, // Provide current image as reference for adjustments
          adjustmentMode: true, // Flag to indicate this is an adjustment, not new generation
          subjectImageUrl: activeSubjectImageUrl, // Only include if actively selected
          referenceImageUrls: activeReferenceImageUrls, // Only include if actively selected
        },
      });

      if (error) {
        console.error('Supabase function error:', error);
        Alert.alert('Error', `Failed to generate adjustment: ${error.message || 'Unknown error'}`);
        return;
      }

      if (data?.error) {
        console.error('Generation error:', data.error);
        Alert.alert('Error', data.error || 'Failed to generate thumbnail adjustment');
        return;
      }

      // Get the new image URL
      const newImageUrl = data?.variation1?.imageUrl || data?.imageUrl;
      if (!newImageUrl) {
        Alert.alert('Error', 'No adjusted image was generated. Please try again.');
        return;
      }

      // Update the current generation in the list with the new URL
      setAllGenerations(prev => prev.map(gen => {
        if (gen.id === currentGeneration.id) {
          // Update the URL that was being edited
          if (gen.url1 === modalImageUrl) {
            return { ...gen, url1: newImageUrl };
          } else if (gen.url2 === modalImageUrl) {
            return { ...gen, url2: newImageUrl };
          }
        }
        return gen;
      }));

      // Update modal to show the new image
      setModalImageUrl(newImageUrl);

      // Clear the edits for the new image
      setThumbnailEdits({
        imageUrl: newImageUrl,
        drawings: [],
        text: null
      });
      setDrawingPaths([]);
      setFinalTextElement(null);
      setModalPrompt('');

      Alert.alert('Success!', 'Your thumbnail has been adjusted');

    } catch (error) {
      console.error('Error generating thumbnail adjustment:', error);
      Alert.alert('Error', 'Something went wrong. Please check your connection and try again.');
    } finally {
      setIsModalGenerating(false);
    }
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
    setPlaceholderText('Enter text'); // Reset placeholder text
    setTextPosition({ x: 0, y: 0 }); // Reset text position
    setTextSize(16); // Reset text size
    setFinalTextElement(null); // Clear final text element
    setModalKeyboardHeight(0); // Reset modal keyboard height
    textTranslateXValue.current.setValue(0);
    textTranslateYValue.current.setValue(0);
    textScaleValue.current.setValue(1);
    textTranslateXValue.current.setOffset(0);
    textTranslateYValue.current.setOffset(0);
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

  const handleTextPlacement = () => {
    if (selectedTool !== 'text') return;

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
              // Replace the placeholder text with the user's text
              setPlaceholderText(userText.trim());
            }
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
      setCurrentPath(updatedPath);
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

      // Update thumbnail edits state
      setThumbnailEdits(prev => prev ? {
        ...prev,
        drawings: [...prev.drawings, newDrawingPath]
      } : null);

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

        // Update thumbnail edits state
        setThumbnailEdits(prev => prev ? {
          ...prev,
          drawings: [...prev.drawings, newDrawingPath]
        } : null);

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
    let promptToUse = topic.trim();

    // Only use images that are actively selected (have local images)
    const activeSubjectImageUrl = subjectImage ? subjectImageUrl : null;
    const activeReferenceImageUrls = referenceImages.length > 0 ? referenceImageUrls : [];

    // Enhance prompt with subject/reference instructions based on actively selected images
    if (activeSubjectImageUrl && activeReferenceImageUrls.length > 0) {
      promptToUse += '. Use the reference image(s) as the exact style and composition template, and replace the main subject/person in the reference with the provided subject image (face swap/body replacement). Maintain the exact background, lighting, pose, and style of the reference.';
    } else if (activeSubjectImageUrl) {
      promptToUse += '. Use the provided subject image as the main focus, incorporating the person/face into the generated thumbnail.';
    } else if (activeReferenceImageUrls.length > 0) {
      promptToUse += '. Use the reference image(s) as inspiration for the style, composition, and overall look of the thumbnail.';
    }

    setLastPrompt(topic.trim()); // Store original prompt for display

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
          subjectImageUrl: activeSubjectImageUrl, // Only include if actively selected
          referenceImageUrls: activeReferenceImageUrls, // Only include if actively selected
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
                    edits={thumbnailEdits?.imageUrl === generation.url1 ? {
                      drawings: thumbnailEdits.drawings,
                      text: thumbnailEdits.text
                    } : null}
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
                    edits={thumbnailEdits?.imageUrl === generation.url2 ? {
                      drawings: thumbnailEdits.drawings,
                      text: thumbnailEdits.text
                    } : null}
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
            {!isLoading && (
              <View style={styles.heroIconContainer}>
                <View style={styles.pictureIcon}>
                  <View style={styles.pictureFrame}>
                    <View style={styles.pictureCorner1} />
                    <View style={styles.pictureCorner2} />
                    <View style={styles.pictureCorner3} />
                    <View style={styles.pictureCorner4} />
                    <View style={styles.picturePlus} />
                    <View style={styles.picturePlusVertical} />
                  </View>
                </View>
              </View>
            )}
            <Text style={styles.heroTitle}>
              {isLoading ? 'Generating your thumbnail...' : 'Generate your thumbnails.'}
            </Text>
            <Text style={styles.heroSubtitle}>
              {isLoading
                ? 'This may take a few moments'
                : 'Type a description or choose from the options below'
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

          <TouchableOpacity
            style={[
              styles.actionCard,
              subjectImage && styles.actionCardWithReference
            ]}
            activeOpacity={0.85}
            onPress={() => setIsSubjectModalVisible(true)}
          >
            <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>👤</Text></View>
            <Text style={styles.actionTitle}>Add a subject</Text>
            <Text style={styles.actionSubtitle}>Include a person or object</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionCard,
              referenceImages.length > 0 && styles.actionCardWithReference
            ]}
            activeOpacity={0.85}
            onPress={() => setIsReferenceModalVisible(true)}
          >
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
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
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
          <View style={[styles.modalHeader, { paddingTop: 60, paddingBottom: 20 }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeModal}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Generated Image in the middle */}
          <View style={[
            styles.centeredImageContainer,
            // Prevent scroll interference when drawing
            selectedTool === 'draw' && { pointerEvents: 'box-none' }
          ]}>
            <View style={styles.imageAndToolsGroup}>
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
                      resizeMode="cover"
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

              {/* Final text element - visible when text tool is not active - draggable and resizable */}
              {selectedTool !== 'text' && finalTextElement && (
                <PinchGestureHandler
                  onGestureEvent={(event) => {
                    const { scale } = event.nativeEvent;
                    const clampedScale = Math.max(0.5, Math.min(5, scale));
                    finalTextScaleValue.current.setValue(clampedScale);
                  }}
                  onHandlerStateChange={(event) => {
                    if (event.nativeEvent.state === State.BEGAN) {
                      setIsScalingFinalText(true);
                    } else if (event.nativeEvent.state === State.END) {
                      const { scale } = event.nativeEvent;
                      const clampedScale = Math.max(0.5, Math.min(5, scale));
                      const newSize = Math.max(8, Math.min(120, finalTextElement.fontSize * clampedScale));

                      // Update the final text element fontSize
                      setFinalTextElement(prev => prev ? {
                        ...prev,
                        fontSize: newSize
                      } : null);

                      // Update thumbnail edits state
                      setThumbnailEdits(prev => prev ? {
                        ...prev,
                        text: finalTextElement ? {
                          ...finalTextElement,
                          fontSize: newSize
                        } : null
                      } : null);

                      // Delay the scale reset until after React re-renders with new fontSize
                      requestAnimationFrame(() => {
                        finalTextScaleValue.current.setValue(1);
                        setIsScalingFinalText(false);
                      });
                    }
                  }}
                  enabled={true}
                >
                  <PanGestureHandler
                  onGestureEvent={(event) => {
                    const { translationX, translationY } = event.nativeEvent;
                    finalTextTranslateX.current.setValue(translationX);
                    finalTextTranslateY.current.setValue(translationY);
                  }}
                  onHandlerStateChange={(event) => {
                    if (event.nativeEvent.state === State.END) {
                      const { translationX, translationY } = event.nativeEvent;
                      // Update the final text element position
                      setFinalTextElement(prev => prev ? {
                        ...prev,
                        x: prev.x + translationX,
                        y: prev.y + translationY
                      } : null);

                      // Update thumbnail edits state
                      setThumbnailEdits(prev => prev ? {
                        ...prev,
                        text: finalTextElement ? {
                          ...finalTextElement,
                          x: finalTextElement.x + translationX,
                          y: finalTextElement.y + translationY
                        } : null
                      } : null);

                      // Reset animated values
                      finalTextTranslateX.current.setValue(0);
                      finalTextTranslateY.current.setValue(0);
                    }
                  }}
                  enabled={true}
                >
                  <Animated.View
                    style={{
                      position: 'absolute',
                      left: finalTextElement.x,
                      top: finalTextElement.y,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      transform: [
                        { translateX: -50 },
                        { translateY: -15 },
                        { translateX: finalTextTranslateX.current },
                        { translateY: finalTextTranslateY.current },
                        ...(isScalingFinalText ? [{ scale: finalTextScaleValue.current }] : [])
                      ],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={[
                        styles.textPlaceholderText,
                        {
                          fontSize: finalTextElement.fontSize,
                          color: '#ffffff',
                          fontWeight: 'bold',
                        }
                      ]}
                    >
                      {finalTextElement.text}
                    </Text>
                  </Animated.View>
                </PanGestureHandler>
                </PinchGestureHandler>
              )}

              {/* Text placement overlay - only when text tool active */}
              {selectedTool === 'text' && (
                <View style={styles.drawingOverlay}>
                  {/* Centered "Enter text" placeholder - clickable, moveable, and resizable */}
                  <PinchGestureHandler
                    onGestureEvent={(event) => {
                      const { scale } = event.nativeEvent;
                      const clampedScale = Math.max(0.75, Math.min(5, scale));
                      textScaleValue.current.setValue(clampedScale);
                    }}
                    onHandlerStateChange={(event) => {
                      if (event.nativeEvent.state === State.END) {
                        const { scale } = event.nativeEvent;
                        const clampedScale = Math.max(0.75, Math.min(5, scale));
                        const newSize = Math.max(12, Math.min(120, textSize * clampedScale));
                        setTextSize(newSize);
                        textScaleValue.current.setValue(1);
                      }
                    }}
                    enabled={true}
                  >
                    <PanGestureHandler
                      onGestureEvent={(event) => {
                        const { translationX, translationY } = event.nativeEvent;
                        textTranslateXValue.current.setValue(translationX);
                        textTranslateYValue.current.setValue(translationY);
                      }}
                      onHandlerStateChange={(event) => {
                        if (event.nativeEvent.state === State.END) {
                          const { translationX, translationY } = event.nativeEvent;
                          setTextPosition(prev => ({
                            x: prev.x + translationX,
                            y: prev.y + translationY
                          }));
                          textTranslateXValue.current.setOffset(textPosition.x + translationX);
                          textTranslateYValue.current.setOffset(textPosition.y + translationY);
                          textTranslateXValue.current.setValue(0);
                          textTranslateYValue.current.setValue(0);
                        }
                      }}
                      enabled={true}
                    >
                      <Animated.View
                        style={[
                          styles.textPlaceholder,
                          {
                            transform: [
                              { translateX: textTranslateXValue.current },
                              { translateY: textTranslateYValue.current },
                              { scale: textScaleValue.current }
                            ],
                            borderWidth: 0,
                            backgroundColor: 'transparent',
                            padding: 8,
                          }
                        ]}
                      >
                        <TouchableOpacity
                          onPress={handleTextPlacement}
                          activeOpacity={0.7}
                          style={{ alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={[styles.textPlaceholderText, { fontSize: textSize }]}>{placeholderText}</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    </PanGestureHandler>
                  </PinchGestureHandler>
                </View>
              )}
            </View>

            {/* Edit Tools */}
            <View style={styles.editTools}>
              <TouchableOpacity
                style={[
                  styles.editToolIcon,
                  selectedTool === 'text' && styles.editToolIconSelected
                ]}
                onPress={() => {
                  if (selectedTool === 'text') {
                    // Deselecting text tool - save current text as final element if it's not "Enter text"
                    if (placeholderText !== 'Enter text') {
                      // Calculate the actual final position including current animated transforms
                      // Use the offset from the animated values which contains the total cumulative position
                      const baseX = 150; // 50% of modal image width
                      const baseY = 125; // 50% of modal image height
                      const finalX = baseX + (textTranslateXValue.current._offset || 0) + (textTranslateXValue.current._value || 0);
                      const finalY = baseY + (textTranslateYValue.current._offset || 0) + (textTranslateYValue.current._value || 0);

                      const textElement = {
                        text: placeholderText,
                        x: finalX,
                        y: finalY,
                        fontSize: textSize
                      };

                      setFinalTextElement(textElement);

                      // Update thumbnail edits state
                      setThumbnailEdits(prev => prev ? {
                        ...prev,
                        text: textElement
                      } : null);
                    }

                    // Reset editing state
                    setSelectedTool(null);
                    setPlaceholderText('Enter text');
                    setTextPosition({ x: 0, y: 0 });
                    setTextSize(16);
                    textTranslateXValue.current.setValue(0);
                    textTranslateYValue.current.setValue(0);
                    textScaleValue.current.setValue(1);
                    textTranslateXValue.current.setOffset(0);
                    textTranslateYValue.current.setOffset(0);
                  } else {
                    // Selecting text tool - load existing text if available
                    setSelectedTool('text');
                    if (finalTextElement) {
                      // Convert final position back to editable position
                      const baseX = 150; // Center X of the image container
                      const baseY = 125; // Center Y of the image container
                      const editX = finalTextElement.x - baseX;
                      const editY = finalTextElement.y - baseY;

                      setPlaceholderText(finalTextElement.text);
                      setTextPosition({ x: editX, y: editY });
                      setTextSize(finalTextElement.fontSize);
                      // Clear the final element since we're editing it again
                      setFinalTextElement(null);
                    }
                  }
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
                  setFinalTextElement(null);

                  // Clear thumbnail edits state
                  setThumbnailEdits(prev => prev ? {
                    ...prev,
                    drawings: [],
                    text: null
                  } : null);

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
                      // Get current edits for this image
                      const currentEdits = thumbnailEdits?.imageUrl === modalImageUrl ? {
                        drawings: thumbnailEdits.drawings,
                        text: thumbnailEdits.text
                      } : null;

                      await saveThumbnail(currentGeneration.prompt, modalImageUrl, currentEdits);
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
          </View>

          {/* Prompt Bar at the bottom */}
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[
              styles.modalPromptContainer,
              {
                paddingBottom: modalKeyboardHeight > 0
                  ? Math.max(modalKeyboardHeight - insets.bottom + 60, Platform.select({ ios: 60, android: 70 }))
                  : Platform.select({ ios: 34, android: 16 })
              }
            ]}>
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
                  blurOnSubmit={false}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Enter' && modalPrompt.trim() && !isModalGenerating) {
                      handleModalGenerate();
                    }
                  }}
                  onSubmitEditing={() => {
                    if (modalPrompt.trim() && !isModalGenerating) {
                      handleModalGenerate();
                    }
                  }}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!modalPrompt || isModalGenerating) && styles.sendBtnDisabled]}
                  disabled={!modalPrompt || isModalGenerating}
                  onPress={handleModalGenerate}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sendArrow}>{isModalGenerating ? '...' : '↑'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
          </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>

      {/* Subject Modal */}
      <Modal
        visible={isSubjectModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsSubjectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add a Subject</Text>
            <Text style={styles.modalSubtitle}>Upload an image of a person or object to include</Text>

            {subjectImage ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: subjectImage }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => {
                    setSubjectImage(null);
                    setSubjectImageUrl(null); // Clear URL when image is removed
                  }}
                >
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={async () => {
                  try {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== 'granted') {
                      Alert.alert('Permission Required', 'Please grant photo library access to upload images');
                      return;
                    }

                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ImagePicker.MediaTypeOptions.Images,
                      allowsEditing: true,
                      aspect: [1, 1],
                      quality: 0.8,
                    });

                    if (!result.canceled && result.assets[0]) {
                      setSubjectImage(result.assets[0].uri);
                    }
                  } catch (error) {
                    console.error('Error picking image:', error);
                    Alert.alert('Error', 'Failed to select image');
                  }
                }}
              >
                <Text style={styles.uploadIcon}>📷</Text>
                <Text style={styles.uploadText}>Upload Subject Image</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setIsSubjectModalVisible(false);
                  // Only clear if user was in the process of selecting (modal was opened without existing image)
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalAddButton, !subjectImage && styles.modalAddButtonDisabled]}
                disabled={!subjectImage}
                onPress={async () => {
                  if (subjectImage) {
                    try {
                      // Upload image to Supabase Storage
                      const uploadedUrl = await uploadImageToStorage(subjectImage, 'subject');

                      if (uploadedUrl) {
                        setSubjectImageUrl(uploadedUrl);
                        Alert.alert('Subject Added', 'Subject image uploaded and ready for thumbnail generation');
                        setIsSubjectModalVisible(false);
                      } else {
                        Alert.alert('Upload Failed', 'Failed to upload subject image. Please try again.');
                      }
                    } catch (error) {
                      console.error('Subject upload error:', error);
                      Alert.alert('Upload Error', 'Something went wrong uploading the subject image.');
                    }
                  }
                }}
              >
                <Text style={styles.modalAddText}>Add Subject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reference Modal */}
      <Modal
        visible={isReferenceModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsReferenceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add a Reference</Text>
            <Text style={styles.modalSubtitle}>Upload up to 3 reference images to inspire the design</Text>

            {/* Reference Images Grid */}
            <View style={styles.referenceImagesContainer}>
              {referenceImages.map((imageUri, index) => (
                <View key={index} style={styles.referenceImageItem}>
                  <Image source={{ uri: imageUri }} style={styles.referenceImagePreview} />
                  <TouchableOpacity
                    style={styles.removeReferenceButton}
                    onPress={() => {
                      setReferenceImages(prev => prev.filter((_, i) => i !== index));
                      setReferenceImageUrls(prev => prev.filter((_, i) => i !== index)); // Clear corresponding URL
                    }}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add more images button */}
              {referenceImages.length < 3 && (
                <TouchableOpacity
                  style={styles.addReferenceButton}
                  onPress={async () => {
                    try {
                      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (status !== 'granted') {
                        Alert.alert('Permission Required', 'Please grant photo library access to upload images');
                        return;
                      }

                      const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ImagePicker.MediaTypeOptions.Images,
                        allowsEditing: true,
                        aspect: [4, 3],
                        quality: 0.8,
                      });

                      if (!result.canceled && result.assets[0]) {
                        setReferenceImages(prev => [...prev, result.assets[0].uri]);
                      }
                    } catch (error) {
                      console.error('Error picking image:', error);
                      Alert.alert('Error', 'Failed to select image');
                    }
                  }}
                >
                  <Text style={styles.addReferenceIcon}>+</Text>
                  <Text style={styles.addReferenceText}>
                    {referenceImages.length === 0 ? 'Add Reference' : `Add ${3 - referenceImages.length} More`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>


            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setIsReferenceModalVisible(false);
                  // Only clear if user was in the process of selecting (modal was opened without existing image)
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalAddButton, referenceImages.length === 0 && styles.modalAddButtonDisabled]}
                disabled={referenceImages.length === 0}
                onPress={async () => {
                  if (referenceImages.length > 0) {
                    try {
                      // Upload all reference images
                      const uploadPromises = referenceImages.map((imageUri, index) =>
                        uploadImageToStorage(imageUri, `reference_${index}`)
                      );

                      const uploadedUrls = await Promise.all(uploadPromises);
                      const validUrls = uploadedUrls.filter(url => url !== null) as string[];

                      if (validUrls.length === referenceImages.length) {
                        setReferenceImageUrls(validUrls);
                        Alert.alert(
                          'References Added',
                          `${validUrls.length} reference image${validUrls.length > 1 ? 's' : ''} uploaded and ready for thumbnail generation`
                        );
                        setIsReferenceModalVisible(false);
                      } else {
                        Alert.alert('Upload Failed', 'Some reference images failed to upload. Please try again.');
                      }
                    } catch (error) {
                      console.error('Reference upload error:', error);
                      Alert.alert('Upload Error', 'Something went wrong uploading the reference images.');
                    }
                  }
                }}
              >
                <Text style={styles.modalAddText}>
                  {referenceImages.length > 0 ? `Add ${referenceImages.length} Reference${referenceImages.length > 1 ? 's' : ''}` : 'Add References'}
                </Text>
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
  heroIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pictureIcon: {
    width: 250,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictureFrame: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictureCorner1: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: MUTED,
  },
  pictureCorner2: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: MUTED,
  },
  pictureCorner3: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: MUTED,
  },
  pictureCorner4: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: MUTED,
  },
  picturePlus: {
    width: 24,
    height: 3,
    backgroundColor: TEXT,
    borderRadius: 1.5,
  },
  picturePlusVertical: {
    position: 'absolute',
    width: 3,
    height: 24,
    backgroundColor: TEXT,
    borderRadius: 1.5,
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
  actionCardWithReference: {
    borderColor: '#fbbf24',
    borderWidth: 2,
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
    aspectRatio: 16/9, // YouTube thumbnail ratio
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
  centeredImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  imageAndToolsGroup: {
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    aspectRatio: 16/9, // YouTube thumbnail ratio
    borderRadius: 12,
    backgroundColor: CARD,
  },
  modalImageContainer: {
    width: '100%',
    aspectRatio: 16/9, // YouTube thumbnail ratio
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  textPlaceholderText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderColor: BORDER,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  uploadButton: {
    backgroundColor: BG,
    borderColor: BORDER,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    minHeight: 120,
  },
  uploadIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  uploadText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '500',
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  changeImageButton: {
    backgroundColor: BG,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  changeImageText: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '500',
  },
  referenceImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  referenceImageItem: {
    position: 'relative',
    width: 100,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  referenceImagePreview: {
    width: '100%',
    height: '100%',
  },
  removeReferenceButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addReferenceButton: {
    width: 100,
    height: 80,
    borderWidth: 2,
    borderColor: BORDER,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  addReferenceIcon: {
    fontSize: 24,
    color: TEXT,
    marginBottom: 4,
  },
  addReferenceText: {
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: BG,
    borderColor: BORDER,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    color: MUTED,
    fontSize: 16,
    fontWeight: '600',
  },
  modalAddButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  modalAddButtonDisabled: {
    backgroundColor: '#374151',
  },
  modalAddText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});