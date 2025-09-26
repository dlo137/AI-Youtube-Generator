import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

interface ThumbnailCardProps {
  id: string;
  title: string;
  date: string;
  status: 'completed' | 'processing' | 'failed';
  imageUrl?: string;
  onDownload?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
}

const BG = '#0b0f14';
const CARD = '#151a21';
const BORDER = '#232932';
const TEXT = '#e7ebf0';
const MUTED = '#8a9099';

export default function ThumbnailCard({
  id,
  title,
  date,
  status,
  imageUrl,
  onDownload,
  onShare,
  onDelete
}: ThumbnailCardProps) {

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
    <TouchableOpacity style={styles.videoCard}>
      <View style={styles.videoHeader}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {title}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(status) },
          ]}
        >
          <Text style={styles.statusText}>
            {getStatusText(status)}
          </Text>
        </View>
      </View>

      <View style={styles.thumbnailPlaceholder}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.placeholderText}>No Image</Text>
        )}
      </View>

      {status === 'completed' && (
        <View style={styles.videoActions}>
          <TouchableOpacity style={styles.actionButton} onPress={onDownload}>
            <Text style={styles.actionButtonText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onShare}>
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete}>
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  videoCard: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
  thumbnailPlaceholder: {
    width: '65%',
    aspectRatio: 16/9,
    backgroundColor: '#3a3f47',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  placeholderText: {
    color: '#8a9099',
    fontSize: 12,
    fontWeight: '500',
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