import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface ThumbnailCardProps {
  id: string;
  title: string;
  date: string;
  status: 'completed' | 'processing' | 'failed';
  imageUrl?: string;
  isFavorited?: boolean;
  edits?: {
    textOverlay?: {
      text: string;
      x: number;
      y: number;
      scale: number;
      rotation: number;
    };
  } | null;
  onDownload?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onFavorite?: () => void;
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
  isFavorited = false,
  edits,
  onDownload,
  onShare,
  onDelete,
  onFavorite
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
        <View style={styles.titleContainer}>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.categoryLabel}>
            {isFavorited ? 'Saved' : 'Completed'}
          </Text>
        </View>
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
          <View style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.thumbnailImage}
              resizeMode="cover"
            />

            {/* Render text overlay */}
            {edits?.textOverlay && (
              <View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none'
              }}>
                {/* Text overlay */}
                {(() => {
                  // Use same scaling factors as thumbnail size
                  const containerWidth = 350;
                  const modalWidth = containerWidth; // Modal image is 100% width
                  const modalHeight = 250; // From styles.modalImage

                  // Thumbnail is 65% width with 16:9 aspect ratio
                  const thumbnailWidth = containerWidth * 0.65; // ~227px
                  const thumbnailHeight = thumbnailWidth / (16/9); // ~128px

                  const scaleX = thumbnailWidth / modalWidth;   // ~0.65
                  const scaleY = thumbnailHeight / modalHeight; // ~0.51

                  return (
                    <View
                      style={{
                        position: 'absolute',
                        left: edits.textOverlay.x * scaleX,
                        top: edits.textOverlay.y * scaleY,
                        transform: [
                          { scale: edits.textOverlay.scale * scaleX },
                          { rotate: `${edits.textOverlay.rotation}deg` }
                        ],
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 24 * scaleX,
                          fontWeight: 'bold',
                          color: 'white',
                          textShadowColor: 'black',
                          textShadowOffset: { width: 1, height: 1 },
                          textShadowRadius: 2,
                        }}
                      >
                        {edits.textOverlay.text}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.placeholderText}>No Image</Text>
        )}
      </View>

      {status === 'completed' && (
        <View style={styles.videoActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.heartButton, isFavorited && styles.heartButtonActive]}
            onPress={onFavorite}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                stroke={isFavorited ? "#ef4444" : "#ffffff"}
                strokeWidth="2"
                fill={isFavorited ? "#ef4444" : "none"}
              />
            </Svg>
          </TouchableOpacity>
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
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#10b981',
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
  heartButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  heartButtonActive: {
    backgroundColor: '#5a2d2d',
    borderColor: '#ef4444',
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