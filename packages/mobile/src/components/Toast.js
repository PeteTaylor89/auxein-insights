// components/Toast.js — Lightweight in-app toast (no external deps)
import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const ToastContext = createContext({ show: () => {} });

export const useToast = () => useContext(ToastContext);

const VARIANTS = {
  success: { bg: colors.success,  icon: 'check-circle' },
  error:   { bg: colors.danger,   icon: 'alert-octagon' },
  info:    { bg: colors.info,     icon: 'info' },
  warning: { bg: colors.warning,  icon: 'alert-triangle' },
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const translateY = useRef(new Animated.Value(-80)).current;
  const timerRef = useRef(null);

  const hide = useCallback(() => {
    Animated.timing(translateY, { toValue: -80, duration: 200, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [translateY]);

  const show = useCallback((message, variant = 'success', duration = 2800) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, variant });
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    timerRef.current = setTimeout(hide, duration);
  }, [translateY, hide]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const v = toast ? VARIANTS[toast.variant] || VARIANTS.info : null;

  // Memoise the context value so screens that consume `useToast()` in their
  // hook dependency arrays (e.g. useFocusEffect → useCallback([toast])) don't
  // re-fire on every provider re-render. Without this, a toast triggered from
  // a failing fetch can cascade into an infinite re-fetch loop.
  const ctxValue = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={ctxValue}>
      {children}
      {toast && v && (
        <Animated.View style={[styles.wrap, { transform: [{ translateY }] }]} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={hide}
            style={[styles.toast, { backgroundColor: v.bg }]}
          >
            <Feather name={v.icon} size={18} color={colors.white} />
            <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 56, paddingHorizontal: spacing.base,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    ...shadows.elevated,
  },
  text: { color: colors.white, fontSize: fontSize.sm, fontWeight: '500', flex: 1 },
});
