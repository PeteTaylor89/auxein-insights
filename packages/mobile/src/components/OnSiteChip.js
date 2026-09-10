// components/OnSiteChip.js — "N on site", and the way into the register.
//
// The count comes from GET /site/active, which is the UNIFIED list: visitors,
// contractors and staff. That is deliberately a different question from the
// "On site now" panel, which is staff attendance only — this one answers "how
// many people are on this place at all", and it is the number that gets read in
// an evacuation.
//
// It reads as a route, not a status label. The chevron is the whole point:
// tapping through to the register is the ONLY way to sign a visitor back OUT
// anywhere in the app. A general_user can sign a visitor IN from their H&S
// actions, so without this chip on their screen that visitor was recorded and
// then unreachable forever.
//
// Count is a prop: every screen using this already batches it into its own
// Promise.all, and fetching in here would be a second request for a number the
// caller has.
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function OnSiteChip({ count = 0, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.chip, style]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Who's on site"
    >
      <Feather name="users" size={14} color={colors.primary} />
      {/* Zero says "Who's on site" rather than "0 on site": the register is
          worth opening even when it is empty, and a bare zero reads as a
          failed fetch. */}
      <Text style={styles.text}>{count > 0 ? `${count} on site` : "Who's on site"}</Text>
      <Feather name="chevron-right" size={14} color={colors.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Always hard right, so it holds its place whether or not a property pill
    // is rendered beside it.
    marginLeft: 'auto',
    backgroundColor: colors.primary + '14',
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  text: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
