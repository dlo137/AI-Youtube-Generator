import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, KeyboardAvoidingView, Keyboard, Animated, Image, Modal, PanResponder, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { PinchGestureHandler, PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../lib/supabase';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import GeneratedThumbnail from '../../src/components/GeneratedThumbnail';
import { saveThumbnail, addThumbnailToHistory } from '../../src/utils/thumbnailStorage';

// Create Animated SVG components
const AnimatedRect = Animated.createAnimatedComponent(Rect);

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
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return null;
    }

    const uploadUrl = `${supabaseUrl}/storage/v1/object/thumbnails/${uniqueFileName}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken || supabaseKey}`,
        'apikey': supabaseKey,
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
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  const shimmer1Anim = useRef(new Animated.Value(0.3)).current;
  const shimmer2Anim = useRef(new Animated.Value(0.3)).current;
  const borderOffset1 = useRef(new Animated.Value(0)).current;
  const borderOffset2 = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [generatedImageUrl2, setGeneratedImageUrl2] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalPrompt, setModalPrompt] = useState('');
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [selectedTool, setSelectedTool] = useState<'save' | null>(null);
  const [textElements, setTextElements] = useState<Array<{id: string, text: string, x: number, y: number, color: string, fontSize: number}>>([]);
  const [isAddingText, setIsAddingText] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isSubjectModalVisible, setIsSubjectModalVisible] = useState(false);
  const [isReferenceModalVisible, setIsReferenceModalVisible] = useState(false);
  const [subjectImage, setSubjectImage] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [subjectImageUrl, setSubjectImageUrl] = useState<string | null>(null);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [thumbnailEdits, setThumbnailEdits] = useState<{
    imageUrl: string;
  } | null>(null);
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
  const [imageContainerDimensions, setImageContainerDimensions] = useState({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isLoading || isModalGenerating) {
      // Animation for loading dots in button
      const createFloatingAnimation = (animValue: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(animValue, {
              toValue: -6,
              duration: 500,
              delay,
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        );
      };

      // Shimmer animation for loading skeletons
      const createShimmerAnimation = (animValue: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(animValue, {
              toValue: 1,
              duration: 800,
              delay,
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0.3,
              duration: 800,
              useNativeDriver: true,
            }),
          ])
        );
      };

      // Border offset animation - travels the gradient along the border
      const createBorderOffsetAnimation = (animValue: Animated.Value) => {
        return Animated.loop(
          Animated.timing(animValue, {
            toValue: 1000, // Total perimeter approximation
            duration: 2500,
            useNativeDriver: false, // Can't use native driver for SVG props
          })
        );
      };

      const animation1 = createFloatingAnimation(dot1Anim, 0);
      const animation2 = createFloatingAnimation(dot2Anim, 150);
      const animation3 = createFloatingAnimation(dot3Anim, 300);

      const shimmer1 = createShimmerAnimation(shimmer1Anim, 0);
      const shimmer2 = createShimmerAnimation(shimmer2Anim, 200);

      const borderAnim1 = createBorderOffsetAnimation(borderOffset1);
      const borderAnim2 = createBorderOffsetAnimation(borderOffset2);

      animation1.start();
      animation2.start();
      animation3.start();
      shimmer1.start();
      shimmer2.start();
      borderAnim1.start();
      borderAnim2.start();

      return () => {
        animation1.stop();
        animation2.stop();
        animation3.stop();
        shimmer1.stop();
        shimmer2.stop();
        borderAnim1.stop();
        borderAnim2.stop();
        dot1Anim.setValue(0);
        dot2Anim.setValue(0);
        dot3Anim.setValue(0);
        borderOffset1.setValue(0);
        borderOffset2.setValue(0);
      };
    }
  }, [isLoading, isModalGenerating]);

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
        imageUrl
      });
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


      // Create an adjustment-focused prompt
      // For zoom/framing requests, allow composition changes
      const isFramingAdjustment = /zoom|show more|show less|pull back|widen|closer|crop|frame|padding|margin/i.test(enhancedPrompt);

      const fullPrompt = isFramingAdjustment
        ? `Original thumbnail: "${currentGeneration.prompt}". Adjustment: ${enhancedPrompt}. Keep the same content and style, but adjust the framing/composition as requested.`
        : `Keep the exact same composition, layout, and core elements from this thumbnail: "${currentGeneration.prompt}". Only make this specific adjustment: ${enhancedPrompt}. Do not change the overall design, just modify the requested aspect while maintaining everything else identical.`;

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
      if (!newImageUrl || !newImageUrl.trim()) {
        Alert.alert('Error', 'No adjusted image was generated. Please try again.');
        return;
      }

      // Validate the URL is properly formed
      if (!newImageUrl.startsWith('http') && !newImageUrl.startsWith('file://')) {
        console.error('Invalid image URL:', newImageUrl);
        Alert.alert('Error', 'Invalid image URL received. Please try again.');
        return;
      }

      // Update the current generation in the list with the new URL
      setAllGenerations(prev => prev.map(gen => {
        if (gen.id === currentGeneration.id) {
          // Update the URL that was being edited, but only if the new URL is valid
          if (gen.url1 === modalImageUrl && newImageUrl) {
            return { ...gen, url1: newImageUrl };
          } else if (gen.url2 === modalImageUrl && newImageUrl) {
            return { ...gen, url2: newImageUrl };
          }
        }
        return gen;
      }));

      // Update modal to show the new image
      setModalImageUrl(newImageUrl);

      // Clear the edits for the new image
      setThumbnailEdits({
        imageUrl: newImageUrl
      });
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
    setTextElements([]);
    setIsAddingText(false);
    setSelectedTextId(null);
    setModalKeyboardHeight(0);
    // Reset zoom and pan
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    scaleValue.current.setValue(1);
    translateXValue.current.setValue(0);
    translateYValue.current.setValue(0);
  };

  const getShortTitle = (prompt: string) => {
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
    if (scale > 1) {
      const { translationX, translationY } = event.nativeEvent;
      translateXValue.current.setValue(translationX);
      translateYValue.current.setValue(translationY);
    }
  };

  const onPanHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END && scale > 1) {
      const { translationX, translationY } = event.nativeEvent;
      setTranslateX(prev => prev + translationX);
      setTranslateY(prev => prev + translationY);
      translateXValue.current.setOffset(translateX + translationX);
      translateYValue.current.setOffset(translateY + translationY);
      translateXValue.current.setValue(0);
      translateYValue.current.setValue(0);
    }
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
          // Automatically add to history (not favorited)
          await addThumbnailToHistory(promptToUse, url1);
        }
        if (url2) {
          setGeneratedImageUrl2(url2);
          // Automatically add to history (not favorited)
          await addThumbnailToHistory(promptToUse, url2);
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

        // Clear subject and reference images after successful generation
        if (activeSubjectImageUrl || activeReferenceImageUrls.length > 0) {
          setSubjectImage(null);
          setSubjectImageUrl(null);
          setReferenceImages([]);
          setReferenceImageUrls([]);
        }
      } else if (data?.imageUrl) {
        // Fallback for backwards compatibility
        setGeneratedImageUrl(data.imageUrl);
        setGeneratedImageUrl2(''); // No second variation

        // Clear subject and reference images after successful generation
        if (activeSubjectImageUrl || activeReferenceImageUrls.length > 0) {
          setSubjectImage(null);
          setSubjectImageUrl(null);
          setReferenceImages([]);
          setReferenceImageUrls([]);
        }
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
        {allGenerations.length > 0 || isLoading ? (
          <View style={styles.generationsContainer}>
            {/* Loading placeholder at the top when generating */}
            {isLoading && (
              <View style={styles.generationSection}>
                <Text style={styles.imageTitle}>{lastPrompt ? getShortTitle(lastPrompt) : 'Generating...'}</Text>

                {/* First loading skeleton */}
                <View style={styles.loadingThumbnailContainer}>
                  <View style={styles.loadingSkeletonWrapper}>
                    <View style={styles.loadingBorderAnimated}>
                      <Svg width="100%" height="100%" viewBox="0 0 350 200" preserveAspectRatio="none">
                        <Defs>
                          <LinearGradient id="borderGrad1">
                            <Stop offset="0%" stopColor="transparent" stopOpacity="0" />
                            <Stop offset="30%" stopColor="#1e40af" stopOpacity="0.6" />
                            <Stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
                            <Stop offset="70%" stopColor="#60a5fa" stopOpacity="1" />
                            <Stop offset="85%" stopColor="#3b82f6" stopOpacity="0.6" />
                            <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
                          </LinearGradient>
                        </Defs>
                        <Rect
                          x="2"
                          y="2"
                          width="346"
                          height="196"
                          rx="12"
                          stroke="#232932"
                          strokeWidth="1"
                          fill="none"
                        />
                        <AnimatedRect
                          x="2"
                          y="2"
                          width="346"
                          height="196"
                          rx="12"
                          stroke="url(#borderGrad1)"
                          strokeWidth="3"
                          fill="none"
                          strokeDasharray="200 800"
                          strokeDashoffset={borderOffset1}
                        />
                      </Svg>
                    </View>
                    <View style={styles.loadingSkeleton}>
                      <Animated.View style={[styles.loadingShimmer, { opacity: shimmer1Anim }]} />
                    </View>
                  </View>
                </View>

                {/* Second loading skeleton */}
                <View style={styles.loadingThumbnailContainer}>
                  <View style={styles.loadingSkeletonWrapper}>
                    <View style={styles.loadingBorderAnimated}>
                      <Svg width="100%" height="100%" viewBox="0 0 350 200" preserveAspectRatio="none">
                        <Defs>
                          <LinearGradient id="borderGrad2">
                            <Stop offset="0%" stopColor="transparent" stopOpacity="0" />
                            <Stop offset="30%" stopColor="#1e40af" stopOpacity="0.6" />
                            <Stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
                            <Stop offset="70%" stopColor="#60a5fa" stopOpacity="1" />
                            <Stop offset="85%" stopColor="#3b82f6" stopOpacity="0.6" />
                            <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
                          </LinearGradient>
                        </Defs>
                        <Rect
                          x="2"
                          y="2"
                          width="346"
                          height="196"
                          rx="12"
                          stroke="#232932"
                          strokeWidth="1"
                          fill="none"
                        />
                        <AnimatedRect
                          x="2"
                          y="2"
                          width="346"
                          height="196"
                          rx="12"
                          stroke="url(#borderGrad2)"
                          strokeWidth="3"
                          fill="none"
                          strokeDasharray="200 800"
                          strokeDashoffset={borderOffset2}
                        />
                      </Svg>
                    </View>
                    <View style={styles.loadingSkeleton}>
                      <Animated.View style={[styles.loadingShimmer, { opacity: shimmer2Anim }]} />
                    </View>
                  </View>
                </View>

                {allGenerations.length > 0 && (
                  <View style={styles.generationSeparator} />
                )}
              </View>
            )}

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
                    onEdit={() => {
                      if (generation.url2) openModal(generation.url2);
                    }}
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
          bottom: keyboardHeight > 0 ? keyboardHeight - insets.bottom - 41 : 0,
          paddingBottom: keyboardHeight > 0 ? 16 : Platform.select({ ios: 34, android: 16 }),
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
            {isLoading ? (
              <View style={styles.loadingDots}>
                <Animated.View style={[styles.dot, { transform: [{ translateY: dot1Anim }] }]} />
                <Animated.View style={[styles.dot, { transform: [{ translateY: dot2Anim }] }]} />
                <Animated.View style={[styles.dot, { transform: [{ translateY: dot3Anim }] }]} />
              </View>
            ) : (
              <Text style={styles.sendArrow}>↑</Text>
            )}
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
                  bottom: 0
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
          <View style={styles.centeredImageContainer}>
            <View style={styles.imageAndToolsGroup}>
              <View style={styles.imageWithDrawing}>
              <PinchGestureHandler
                onGestureEvent={onPinchGestureEvent}
                onHandlerStateChange={onPinchHandlerStateChange}
              >
                <PanGestureHandler
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanHandlerStateChange}
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
                    onLayout={(event) => {
                      const { width, height } = event.nativeEvent.layout;
                      setImageContainerDimensions({ width, height });
                    }}
                  >
                    <Image
                      source={{ uri: modalImageUrl }}
                      style={styles.modalImage as any}
                      resizeMode="cover"
                    />

                  </Animated.View>
                </PanGestureHandler>
              </PinchGestureHandler>

            </View>

            {/* Edit Tools */}
            <View style={styles.editTools}>
              <TouchableOpacity
                style={styles.editToolIcon}
                onPress={() => {
                  // TODO: Implement erase logic
                }}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M4.5 12.5l7-7a4.95 4.95 0 1 1 7 7l-7 7a4.95 4.95 0 1 1-7-7z"
                    stroke="#ffffff"
                    strokeWidth="2"
                    fill="none"
                  />
                  <Path d="M8.5 8.5h1v1h-1zm5 0h1v1h-1zm-5 5h1v1h-1zm5 0h1v1h-1z" fill="#ffffff" />
                </Svg>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editToolIcon,
                  selectedTool === 'save' && styles.editToolIconSelected
                ]}
                onPress={async () => {
                  // Check if user is in guest mode
                  if ((global as any)?.isGuestMode) {
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
                      await saveThumbnail(currentGeneration.prompt, modalImageUrl, null);
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
                  ? Math.max(
                      modalKeyboardHeight - insets.bottom + 60,
                      Platform.select({ ios: 60, android: 70 }) ?? 60
                    )
                  : Platform.select({ ios: 34, android: 16 })
              }
            ]}>
              <View style={styles.modalInputBar}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Edit your thumbnail prompt"
                  placeholderTextColor="#7b818a"
                  value={modalPrompt}
                  onChangeText={setModalPrompt}
                  multiline
                  returnKeyType="send"
                  blurOnSubmit={true}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Enter') {
                      if (modalPrompt.trim() && !isModalGenerating) {
                        handleModalGenerate();
                      }
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
                  {isModalGenerating ? (
                    <View style={styles.loadingDots}>
                      <Animated.View style={[styles.dot, { transform: [{ translateY: dot1Anim }] }]} />
                      <Animated.View style={[styles.dot, { transform: [{ translateY: dot2Anim }] }]} />
                      <Animated.View style={[styles.dot, { transform: [{ translateY: dot3Anim }] }]} />
                    </View>
                  ) : (
                    <Text style={styles.sendArrow}>↑</Text>
                  )}
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
                <Image source={{ uri: subjectImage }} style={styles.imagePreview as any} />
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
                  <Image source={{ uri: imageUri }} style={styles.referenceImagePreview as any} />
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
    paddingLeft: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
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
  loadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
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
  loadingThumbnailContainer: {
    width: '100%',
    marginBottom: 20,
    position: 'relative',
  },
  loadingSkeletonWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16/9,
  },
  loadingBorderAnimated: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  loadingSkeleton: {
    width: '100%',
    aspectRatio: 16/9,
    borderRadius: 12,
    backgroundColor: CARD,
    overflow: 'hidden',
    position: 'relative',
  },
  loadingShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(139, 146, 155, 0.1)',
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