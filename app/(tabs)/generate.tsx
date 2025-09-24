import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

export default function GenerateScreen() {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState('');
  const [style, setStyle] = useState('educational');

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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Generate AI Video</Text>
        <Text style={styles.subtitle}>Create amazing content with artificial intelligence</Text>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Video Topic</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your video topic..."
              value={topic}
              onChangeText={setTopic}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              placeholder="5"
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Video Style</Text>
            <View style={styles.styleSelector}>
              {videoStyles.map((styleOption) => (
                <TouchableOpacity
                  key={styleOption.id}
                  style={[
                    styles.styleOption,
                    style === styleOption.id && styles.selectedStyle,
                  ]}
                  onPress={() => setStyle(styleOption.id)}
                >
                  <Text
                    style={[
                      styles.styleText,
                      style === styleOption.id && styles.selectedStyleText,
                    ]}
                  >
                    {styleOption.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.previewSection}>
            <Text style={styles.label}>Preview</Text>
            <View style={styles.preview}>
              <Text style={styles.previewText}>
                {topic
                  ? `Creating a ${duration || 5}-minute ${style} video about: "${topic}"`
                  : 'Enter a topic to see preview...'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.generateButton, !topic && styles.disabledButton]}
            onPress={handleGenerate}
            disabled={!topic}
          >
            <Text style={styles.generateButtonText}>Generate Video</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 30,
  },
  form: {
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#374151',
    textAlignVertical: 'top',
  },
  styleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  styleOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  selectedStyle: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  styleText: {
    fontSize: 14,
    color: '#374151',
  },
  selectedStyleText: {
    color: '#fff',
  },
  previewSection: {
    gap: 8,
  },
  preview: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },
  generateButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  disabledButton: {
    backgroundColor: '#94a3b8',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});