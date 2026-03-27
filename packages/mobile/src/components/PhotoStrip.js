// components/PhotoStrip.js — Reusable photo preview strip with add/remove
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function PhotoStrip({ images, onAdd, onRemove, uploading }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
        {images.map((uri, i) => (
          <View key={i} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} />
            <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(i)}>
              <Text style={styles.removeBtnText}>x</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.addBtnText}>+ Photo</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginBottom: spacing.xs },
  strip: { flexDirection: 'row' },
  thumbWrap: { position: 'relative', marginRight: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radius.sm },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center',
  },
  removeBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  addBtn: {
    width: 72, height: 72, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  addBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
});
