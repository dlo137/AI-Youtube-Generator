import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function HistoryScreen() {
  const videoHistory = [
    {
      id: 1,
      title: 'AI-Generated Tutorial: React Native Basics',
      date: '2024-09-22',
      status: 'completed',
      views: 1234,
      duration: '8:45',
    },
    {
      id: 2,
      title: 'Top 10 JavaScript Tips',
      date: '2024-09-17',
      status: 'completed',
      views: 892,
      duration: '12:30',
    },
    {
      id: 3,
      title: 'Introduction to TypeScript',
      date: '2024-09-15',
      status: 'processing',
      views: 0,
      duration: '10:15',
    },
    {
      id: 4,
      title: 'Building Mobile Apps with Expo',
      date: '2024-09-12',
      status: 'completed',
      views: 567,
      duration: '15:20',
    },
    {
      id: 5,
      title: 'CSS Grid Layout Explained',
      date: '2024-09-08',
      status: 'failed',
      views: 0,
      duration: '7:30',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'processing':
        return '#f59e0b';
      case 'failed':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Video History</Text>
        <Text style={styles.subtitle}>Track your generated content</Text>

        <View style={styles.filterSection}>
          <TouchableOpacity style={[styles.filterButton, styles.activeFilter]}>
            <Text style={[styles.filterText, styles.activeFilterText]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterButton}>
            <Text style={styles.filterText}>Completed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterButton}>
            <Text style={styles.filterText}>Processing</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterButton}>
            <Text style={styles.filterText}>Failed</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.videoList}>
          {videoHistory.map((video) => (
            <TouchableOpacity key={video.id} style={styles.videoCard}>
              <View style={styles.videoHeader}>
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {video.title}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(video.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusText(video.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.videoMeta}>
                <Text style={styles.metaText}>Created: {video.date}</Text>
                <Text style={styles.metaText}>Duration: {video.duration}</Text>
                {video.status === 'completed' && (
                  <Text style={styles.metaText}>Views: {video.views.toLocaleString()}</Text>
                )}
              </View>

              {video.status === 'completed' && (
                <View style={styles.videoActions}>
                  <TouchableOpacity style={styles.actionButton}>
                    <Text style={styles.actionButtonText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Text style={styles.actionButtonText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.deleteButton]}>
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}
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
  videoCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  videoMeta: {
    gap: 4,
    marginBottom: 16,
  },
  metaText: {
    fontSize: 14,
    color: MUTED,
  },
  videoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a3038',
    borderWidth: 1,
    borderColor: BORDER,
  },
  deleteButton: {
    backgroundColor: '#3d1a1a',
    borderColor: '#5a2d2d',
  },
  actionButtonText: {
    fontSize: 12,
    color: TEXT,
    fontWeight: '500',
  },
  deleteButtonText: {
    color: '#f87171',
  },
});