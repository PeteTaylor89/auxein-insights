// screens/CreateAssetScreen.js — Lightweight asset registration
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { assetService, propertyService } from '../api/services';
import {
  SectionCard, FilledInput, BottomActionBar, KeyboardAvoider, useToast,
  ASSET_CATEGORY_ICONS,
} from '../components';

const CATEGORIES = [
  { value: 'equipment',      label: 'Equipment',      assetType: 'physical' },
  { value: 'vehicle',        label: 'Vehicle',        assetType: 'physical' },
  { value: 'tool',           label: 'Tool',           assetType: 'physical' },
  { value: 'consumable',     label: 'Consumable',     assetType: 'consumable' },
  { value: 'infrastructure', label: 'Infrastructure', assetType: 'physical' },
];

export default function CreateAssetScreen({ navigation }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [properties, setProperties] = useState([]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [assetNumber, setAssetNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [propertyId, setPropertyId] = useState(null);
  const [unitOfMeasure, setUnitOfMeasure] = useState('');
  const [currentStock, setCurrentStock] = useState('');

  useEffect(() => {
    propertyService.listProperties()
      .then(data => {
        const props = Array.isArray(data) ? data : [];
        setProperties(props);
        if (props.length === 1) setPropertyId(props[0].id);
      })
      .catch(() => {});
  }, []);

  const selectedCategory = CATEGORIES.find(c => c.value === category);
  const isConsumable = selectedCategory?.assetType === 'consumable';

  const canSubmit =
    name.trim().length > 0 &&
    !!category &&
    assetNumber.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.show('Fill required fields to continue', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        asset_type: selectedCategory.assetType,
        asset_number: assetNumber.trim(),
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        serial_number: serial.trim() || undefined,
        location_label: locationLabel.trim() || undefined,
        property_id: propertyId || undefined,
        status: 'active',
      };
      if (isConsumable) {
        payload.unit_of_measure = unitOfMeasure.trim() || undefined;
        if (currentStock) {
          const n = parseFloat(currentStock);
          if (!isNaN(n)) payload.current_stock = n;
        }
      }
      await assetService.createAsset(payload);
      toast.show('Asset registered', 'success');
      navigation.goBack();
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.show(typeof msg === 'string' ? msg : 'Failed to create asset', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>New asset</Text>
            <Text style={styles.headerSub}>Register equipment, tool, or stock</Text>
          </View>
          <Feather name="package" size={22} color={colors.white} />
        </View>
      </SafeAreaView>

      <KeyboardAvoider>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <SectionCard icon="layers" title="Category">
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(c => {
                const selected = category === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.categoryCard, selected && styles.categoryCardActive]}
                    onPress={() => setCategory(c.value)}
                    activeOpacity={0.75}
                  >
                    <Feather
                      name={ASSET_CATEGORY_ICONS[c.value] || 'package'}
                      size={20}
                      color={selected ? colors.primary : colors.textMuted}
                    />
                    <Text style={[styles.categoryLabel, selected && styles.categoryLabelActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          <SectionCard icon="edit-3" title="Basic details">
            <FilledInput
              label="Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="e.g. John Deere 5E Tractor"
            />
            <FilledInput
              label="Asset number"
              required
              value={assetNumber}
              onChangeText={setAssetNumber}
              placeholder="e.g. EQ-001"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <FilledInput
                  label="Make"
                  value={make}
                  onChangeText={setMake}
                  placeholder="e.g. John Deere"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FilledInput
                  label="Model"
                  value={model}
                  onChangeText={setModel}
                  placeholder="e.g. 5E"
                />
              </View>
            </View>
            <FilledInput
              label="Serial number"
              value={serial}
              onChangeText={setSerial}
              placeholder="Optional"
            />
          </SectionCard>

          {isConsumable && (
            <SectionCard icon="droplet" title="Stock">
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FilledInput
                    label="Unit of measure"
                    value={unitOfMeasure}
                    onChangeText={setUnitOfMeasure}
                    placeholder="e.g. L, kg"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FilledInput
                    label="Current stock"
                    value={currentStock}
                    onChangeText={setCurrentStock}
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </SectionCard>
          )}

          <SectionCard icon="map-pin" title="Location">
            <FilledInput
              label="Location label"
              value={locationLabel}
              onChangeText={setLocationLabel}
              placeholder="e.g. Main shed, Block A store"
            />

            {properties.length > 1 && (
              <>
                <Text style={styles.propertyLabel}>Property</Text>
                <View style={styles.propertyList}>
                  {properties.map(p => {
                    const selected = propertyId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.propertyRow, selected && styles.propertyRowActive]}
                        onPress={() => setPropertyId(p.id)}
                      >
                        <Feather
                          name={selected ? 'check-circle' : 'circle'}
                          size={18}
                          color={selected ? colors.success : colors.textMuted}
                        />
                        <Text style={styles.propertyText}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </SectionCard>

          <Text style={styles.hint}>
            Want to set detailed specs, calibration schedules, or financials?
            Finish creating here and edit on the web app.
          </Text>

          <View style={{ height: spacing.xxl }} />
        </ScrollView>

        <BottomActionBar
          secondaryLabel="Cancel"
          secondaryIcon="x"
          onSecondary={() => navigation.goBack()}
          primaryLabel={submitting ? 'Creating...' : 'Create asset'}
          primaryIcon="check"
          primaryColor="green"
          onPrimary={handleSubmit}
          disabled={submitting || !canSubmit}
        />
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs, marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  row: { flexDirection: 'row', gap: spacing.md },

  // Category cards
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: {
    width: '31%', minWidth: 90, flexGrow: 1,
    alignItems: 'center', gap: 6,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  categoryCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
  categoryLabel: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', fontWeight: '500' },
  categoryLabelActive: { color: colors.primary, fontWeight: '700' },

  // Property picker
  propertyLabel: {
    fontSize: 12, fontWeight: '600', color: colors.textSecondary,
    marginBottom: 6, marginTop: spacing.sm,
  },
  propertyList: { gap: spacing.xs },
  propertyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  propertyRowActive: { borderColor: colors.success, backgroundColor: colors.gpsBg },
  propertyText: { fontSize: fontSize.base, color: colors.text, fontWeight: '500' },

  hint: {
    fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic',
    textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.md,
  },
});
