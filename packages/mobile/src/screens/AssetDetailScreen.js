// screens/AssetDetailScreen.js — Read-only asset detail with location link
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { assetService } from '../api/services';

const STATUS_COLORS = {
  active: colors.success,
  maintenance: colors.warning,
  retired: colors.textMuted,
  disposed: colors.danger,
  out_of_stock: colors.danger,
};

export default function AssetDetailScreen({ route, navigation }) {
  const { assetId } = route.params;
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await assetService.getAsset(assetId);
        setAsset(data);
        navigation.setOptions({ title: data.name || 'Asset Detail' });
      } catch (err) {
        console.log('Failed to load asset:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [assetId]);

  const openInMaps = () => {
    if (!asset?.latitude || !asset?.longitude) return;
    const url = Platform.select({
      ios: `maps:?q=${asset.name}&ll=${asset.latitude},${asset.longitude}`,
      android: `geo:${asset.latitude},${asset.longitude}?q=${asset.latitude},${asset.longitude}(${asset.name})`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps?q=${asset.latitude},${asset.longitude}`);
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!asset) {
    return <View style={styles.center}><Text style={styles.errorText}>Asset not found</Text></View>;
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerName}>{asset.name}</Text>
        <Text style={styles.headerNumber}>#{asset.asset_number}</Text>
        <View style={styles.headerRow}>
          <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[asset.status] || colors.textMuted) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[asset.status] || colors.textMuted }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS[asset.status] || colors.textMuted }]}>
              {asset.status?.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={styles.categoryText}>{asset.category}{asset.subcategory ? ` / ${asset.subcategory}` : ''}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        {asset.make && <Field label="Make" value={asset.make} />}
        {asset.model && <Field label="Model" value={asset.model} />}
        {asset.serial_number && <Field label="Serial Number" value={asset.serial_number} />}
        {asset.year_manufactured && <Field label="Year" value={String(asset.year_manufactured)} />}
        {asset.description && <Field label="Description" value={asset.description} />}
      </View>

      {/* Location */}
      {(asset.location_label || asset.latitude) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          {asset.location_label && <Field label="Location" value={asset.location_label} />}
          {asset.latitude && asset.longitude && (
            <>
              <Field label="Coordinates" value={`${Number(asset.latitude).toFixed(5)}, ${Number(asset.longitude).toFixed(5)}`} />
              <TouchableOpacity style={styles.mapBtn} onPress={openInMaps}>
                <Text style={styles.mapBtnText}>Open in Maps</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Consumable stock */}
      {asset.asset_type === 'consumable' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stock</Text>
          <Field label="Current Stock" value={`${asset.current_stock ?? 0}${asset.unit_of_measure ? ` ${asset.unit_of_measure}` : ''}`} />
          {asset.minimum_stock != null && <Field label="Minimum Stock" value={`${asset.minimum_stock}${asset.unit_of_measure ? ` ${asset.unit_of_measure}` : ''}`} />}
          {asset.active_ingredient && <Field label="Active Ingredient" value={asset.active_ingredient} />}
          {asset.withholding_period_days != null && <Field label="Withholding Period" value={`${asset.withholding_period_days} days`} />}
        </View>
      )}

      {/* Calibration / Maintenance */}
      {(asset.requires_calibration || asset.requires_maintenance) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servicing</Text>
          {asset.requires_calibration && (
            <Field label="Calibration Interval" value={asset.calibration_interval_days ? `Every ${asset.calibration_interval_days} days` : 'Required'} />
          )}
          {asset.requires_maintenance && (
            <Field label="Maintenance Interval" value={
              asset.maintenance_interval_days ? `Every ${asset.maintenance_interval_days} days`
                : asset.maintenance_interval_hours ? `Every ${asset.maintenance_interval_hours} hours`
                : 'Required'
            } />
          )}
          {asset.current_hours > 0 && <Field label="Current Hours" value={`${asset.current_hours} hrs`} />}
          {asset.current_kilometers > 0 && <Field label="Current Km" value={`${asset.current_kilometers} km`} />}
        </View>
      )}

      {/* Web banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Full asset management available on the web app</Text>
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: fontSize.base, color: colors.danger },
  header: {
    backgroundColor: colors.primary, padding: spacing.base, paddingTop: spacing.lg,
  },
  headerName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  headerNumber: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  categoryText: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.8)', textTransform: 'capitalize' },
  section: {
    margin: spacing.base, marginBottom: 0, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  field: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textMuted, flex: 1 },
  fieldValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, flex: 1, textAlign: 'right' },
  mapBtn: {
    marginTop: spacing.sm, backgroundColor: colors.info, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  mapBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },
  banner: {
    margin: spacing.base, padding: spacing.md, backgroundColor: colors.infoBg,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.info + '40',
  },
  bannerText: { fontSize: fontSize.xs, color: colors.info, textAlign: 'center' },
});
