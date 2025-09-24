import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

export default function GenerateScreen() {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(''); // kept for existing logic
  const [style, setStyle] = useState('educational'); // kept for existing logic

  // kept from original for backwards-compat; do not change functionality
  const videoStyles = [
    { id: 'educational', label: 'Educational' },
    { id: 'entertaining', label: 'Entertaining' },
    { id: 'promotional', label: 'Promotional' },
    { id: 'tutorial', label: 'Tutorial' },
  ];

  const handleGenerate = () => {
    console.log('Generating video with:', { topic, duration, style });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.burger} activeOpacity={0.7}>
            <Text style={styles.burgerIcon}>≡</Text>
          </TouchableOpacity>

          <Text style={styles.topTitle}>Thumbnail Generator</Text>

          <View style={styles.avatar} />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Create your first thumbnail.</Text>
          <Text style={styles.heroSubtitle}>Simply type or pick one of the options below</Text>
        </View>

        {/* Main Content Area - can be expanded for generated thumbnails */}
        <View style={styles.mainContent}>
          {/* This area can display generated thumbnails or other content */}
        </View>

        {/* Action Cards (h-scroll) - moved to bottom */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionRow}
        >
          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>🎞️</Text></View>
            <Text style={styles.actionTitle}>Add a video</Text>
            <Text style={styles.actionSubtitle}>Analyze your content</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>👤</Text></View>
            <Text style={styles.actionTitle}>Add a subject</Text>
            <Text style={styles.actionSubtitle}>Include a person or object</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} activeOpacity={0.85}>
            <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>✨</Text></View>
            <Text style={styles.actionTitle}>Add a style</Text>
            <Text style={styles.actionSubtitle}>Inspire the design</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Prompt Bar - moved to bottom */}
        <View style={styles.inputBar}>
          <Text style={styles.paperclip}>📎</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Describe your thumbnail idea"
            placeholderTextColor="#7b818a"
            value={topic}
            onChangeText={setTopic}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !topic && styles.sendBtnDisabled]}
            onPress={handleGenerate}
            disabled={!topic}
            activeOpacity={0.8}
          >
            <Text style={styles.sendArrow}>↑</Text>
          </TouchableOpacity>
        </View>

        {/* Spacer so bottom nav (outside this file) has breathing room */}
        <View style={{ height: 40 }} />
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
  scroll: {
    paddingTop: Platform.select({ ios: 12, android: 16 }),
    paddingHorizontal: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  burger: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burgerIcon: {
    color: TEXT,
    fontSize: 22,
    lineHeight: 22,
  },
  topTitle: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3a3f47',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 18,
  },
  mainContent: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 18,
  },
  paperclip: {
    fontSize: 16,
    marginRight: 8,
    color: MUTED,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    color: TEXT,
    fontSize: 15,
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