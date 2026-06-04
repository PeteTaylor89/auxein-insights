// screens/ContractorCreateObservationScreen.js — Contractor one-shot ad-hoc
// observation. Single page form: company/property/block scope (pre-filled
// from active check-in), title, notes, GPS, photos. Backend creates a hidden
// ObservationRun + single Spot under a per-company ad-hoc template.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService, fileService } from '../api/services';
import { FilledInput, PhotoGrid, KeyboardAvoider, useToast } from '../components';
import useImageCapture from '../hooks/useImageCapture';
import useActiveCheckIn from '../hooks/useActiveCheckIn';

export default function ContractorCreateObservationScreen({ navigation }) {
  const toast = useToast();
  const checkIn = useActiveCheckIn();
  const imageCapture = useImageCapture('observation_spot', null);

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [blockId, setBlockId] = useState(null);

  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);
  // One-shot pre-fill so manual overrides survive focus refreshes.
  const [didPrefill, setDidPrefill] = useState(false);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState(null); // [lng, lat]
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Log observation' });
    contractorService.listMyCompanies()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCompanies(list);
        if (checkIn.companyId && list.some(c => c.id === checkIn.companyId)) {
          setCompanyId(checkIn.companyId);
        } else if (list.length === 1) {
          setCompanyId(list[0].id);
        }
      })
      .catch(() => toast.show('Could not load companies', 'error'));
  }, [navigation, toast, checkIn.companyId]);

  useEffect(() => {
    setPropertyId(null);
    setBlockId(null);
    setProperties([]);
    setBlocks([]);
    if (companyId == null) return;
    setPropertiesLoading(true);
    contractorService.listMyScopedProperties(companyId)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setProperties(list);
        if (
          !didPrefill
          && checkIn.companyId === companyId
          && checkIn.propertyId
          && list.some(p => p.id === checkIn.propertyId)
        ) {
          setPropertyId(checkIn.propertyId);
          setDidPrefill(true);
        } else if (list.length === 1) {
          setPropertyId(list[0].id);
        }
      })
      .catch(() => toast.show('Could not load properties', 'error'))
      .finally(() => setPropertiesLoading(false));
  }, [companyId, toast, checkIn.companyId, checkIn.propertyId, didPrefill]);

  useEffect(() => {
    setBlockId(null);
    setBlocks([]);
    if (propertyId == null) return;
    setBlocksLoading(true);
    contractorService.listMyScopedBlocks(propertyId)
      .then(data => setBlocks(Array.isArray(data) ? data : []))
      .catch(() => toast.show('Could not load blocks', 'error'))
      .finally(() => setBlocksLoading(false));
  }, [propertyId, toast]);

  const captureGps = async () => {
    setGpsLoading(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        toast.show('Location permission denied', 'error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords([pos.coords.longitude, pos.coords.latitude]);
      toast.show('GPS captured', 'success');
    } catch {
      toast.show('Could not get GPS', 'error');
    } finally {
      setGpsLoading(false);
    }
  };

  const submit = async () => {
    if (companyId == null) return toast.show('Pick a company', 'error');
    if (!title.trim()) return toast.show('Add a title', 'error');

    setSubmitting(true);
    try {
      const created = await contractorService.createMyObservation({
        company_id: companyId,
        property_id: propertyId,
        block_id: blockId,
        title: title.trim(),
        notes: notes.trim() || null,
        latitude: coords ? coords[1] : null,
        longitude: coords ? coords[0] : null,
        observed_at: new Date().toISOString(),
      });

      // Photos upload against the spot row id (not the run). Failures are
      // non-fatal — the observation itself is saved; photos can be re-attached
      // by reopening the spot if it surfaces in the UI.
      if (imageCapture.images.length > 0 && created?.spot_id) {
        for (const uri of imageCapture.images) {
          try {
            await fileService.upload('observation_spot', created.spot_id, uri, 'photo');
          } catch (err) {
            console.log('Photo upload failed:', err.message);
          }
        }
      }

      toast.show('Observation logged', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not save', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoider>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Company *</Text>
        {companies.length === 0 ? (
          <View style={styles.emptyHint}>
            <Feather name="info" size={14} color={colors.info} />
            <Text style={styles.emptyHintText}>No active companies yet.</Text>
          </View>
        ) : (
          <View style={styles.pillRow}>
            {companies.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.pill, companyId === c.id && styles.pillActive]}
                onPress={() => setCompanyId(c.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, companyId === c.id && styles.pillTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {companyId != null && (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Property</Text>
            {propertiesLoading ? (
              <Text style={styles.hintText}>Loading…</Text>
            ) : properties.length === 0 ? (
              <Text style={styles.hintText}>No properties yet.</Text>
            ) : (
              <View style={styles.pillRow}>
                {properties.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pill, propertyId === p.id && styles.pillActive]}
                    onPress={() => setPropertyId(propertyId === p.id ? null : p.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, propertyId === p.id && styles.pillTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {propertyId != null && (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Block</Text>
            {blocksLoading ? (
              <Text style={styles.hintText}>Loading…</Text>
            ) : blocks.length === 0 ? (
              <Text style={styles.hintText}>No blocks on this property.</Text>
            ) : (
              <View style={styles.pillRow}>
                {blocks.map(b => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.pill, blockId === b.id && styles.pillActive]}
                    onPress={() => setBlockId(blockId === b.id ? null : b.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, blockId === b.id && styles.pillTextActive]}>
                      {b.block_name || `Block #${b.id}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <FilledInput
          label="Title"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="What did you observe?"
          style={{ marginTop: spacing.lg }}
        />

        <FilledInput
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          placeholder="Details, context, what you saw…"
        />

        <TouchableOpacity style={styles.gpsBtn} onPress={captureGps} disabled={gpsLoading} activeOpacity={0.7}>
          <Feather name="map-pin" size={14} color={coords ? colors.success : colors.primary} />
          <Text style={[styles.gpsText, coords && { color: colors.success }]}>
            {coords ? 'GPS captured' : (gpsLoading ? 'Locating…' : 'Capture GPS')}
          </Text>
          {coords && (
            <TouchableOpacity onPress={() => setCoords(null)} hitSlop={8}>
              <Feather name="x" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Photos</Text>
        <PhotoGrid
          photos={imageCapture.images}
          maxPhotos={3}
          onAddPhoto={imageCapture.showPicker}
          onRemovePhoto={imageCapture.removeImage}
        />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.barWrap}>
        <View style={styles.bar}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
            disabled={submitting}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, (companyId == null || submitting) && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={companyId == null || submitting}
            activeOpacity={0.85}
          >
            <Feather name="check" size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{submitting ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: spacing.sm },
  hintText: { fontSize: fontSize.xs, color: colors.textMuted, paddingVertical: spacing.sm },

  emptyHint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.infoBg, padding: spacing.sm,
    borderRadius: radius.md,
  },
  emptyHintText: { fontSize: fontSize.sm, color: colors.info, flex: 1 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  pillTextActive: { color: colors.white, fontWeight: '700' },

  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  gpsText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600', flex: 1 },

  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.base },
  secondaryBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.borderLight, borderRadius: radius.md,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600' },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
