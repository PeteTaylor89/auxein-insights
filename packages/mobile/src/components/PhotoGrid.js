import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function PhotoGrid({ photos = [], maxPhotos = 3, onAddPhoto, onRemovePhoto, label }) {
  const slots = [];
  for (let i = 0; i < Math.max(photos.length + 1, 1); i++) {
    if (i < photos.length) {
      slots.push({ type: 'photo', uri: photos[i].uri || photos[i], index: i });
    } else if (slots.length < maxPhotos) {
      slots.push({ type: 'add' });
    }
  }

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label} ({photos.length} of {maxPhotos})
        </Text>
      )}
      <View style={styles.grid}>
        {slots.map((slot, i) => {
          if (slot.type === 'photo') {
            return (
              <View key={i} style={styles.thumb}>
                <Image source={{ uri: slot.uri }} style={styles.image} />
                <View style={styles.checkBadge}>
                  <Feather name="check" size={10} color={colors.white} />
                </View>
                {onRemovePhoto && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onRemovePhoto(slot.index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={12} color={colors.white} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }
          return (
            <TouchableOpacity key={i} style={styles.addThumb} onPress={onAddPhoto} activeOpacity={0.7}>
              <Feather name="image" size={24} color={colors.textMuted} />
              <Text style={styles.addText}>Add Photo</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.olive,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gpsActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addThumb: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 4,
  },
});
