// components/BrandHeader.js — the Auxein Grow bar at the top of a home screen.
//
// Extracted from HomeScreen rather than copied to the general_user's screen.
// A brand mark is exactly the thing that must not exist twice: the second copy
// gets a different padding or a different wordmark six months later and nobody
// notices, because no one person ever sees both screens.
//
// It owns its own top safe area so the primary colour runs into the notch. A
// caller therefore renders it inside a plain View, NOT inside another
// SafeAreaView with `edges={['top']}` — that would inset it twice and leave a
// pale band above the bar.
//
// The bell is a prop, not a hardcoded route: notifications live in a different
// stack for each account type — under Profile for a full user, in the sign-on
// stack for a general_user — and a component that guessed would silently
// navigate nowhere for one of them. The COUNT is a prop too: the screens that
// use this already batch it into a Promise.all with their own data, and a fetch
// in here would be a second request for a number they already have.
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

const LOGO_MARK = require('../../assets/brand/logo-mark.png');

export default function BrandHeader({ unreadCount = 0, onBellPress }) {
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafe}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image source={LOGO_MARK} style={styles.brandMark} resizeMode="contain" />
          <Text style={styles.brandWordmark}>Auxein Grow</Text>
        </View>

        {/* No bell at all when the caller has nowhere to send it, rather than a
            button that does nothing. */}
        {onBellPress && (
          <TouchableOpacity style={styles.bellBtn} onPress={onBellPress} hitSlop={10}>
            <Feather name="bell" size={20} color={colors.white} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 28, height: 28 },
  brandWordmark: {
    color: colors.white, fontSize: fontSize.lg, fontWeight: '700',
    letterSpacing: 0.3,
  },
  bellBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: colors.danger, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primary,
  },
  bellBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
});
