// screens/SpotCaptureScreen.js — Capture observation spots with dynamic template fields
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard, Modal, FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { observationService } from '../api/services';
import useImageCapture from '../hooks/useImageCapture';
import { SectionCard, GpsSection, BottomActionBar, PhotoGrid } from '../components';

export default function SpotCaptureScreen({ route, navigation }) {
  const { templateId, blockId, blockName, templateName, planName, companyId, planId,
          runId: existingRunId } = route.params;

  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState(existingRunId || null);
  const [referenceData, setReferenceData] = useState({});

  // Picker modal state (shared for options_source and date/time fields)
  const [pickerField, setPickerField] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(null); // { fieldName, mode: 'date'|'time'|'datetime', step: 'date'|'time' }

  const imageCapture = useImageCapture('observation_spot', null);

  // Load template, reference data, and existing spots (if resuming a run)
  useEffect(() => {
    (async () => {
      try {
        const promises = [observationService.getTemplate(templateId)];
        if (runId) promises.push(observationService.getSpots(runId).catch(() => []));
        const [tpl, existingSpots] = await Promise.all(promises);
        setTemplate(tpl);
        const rawSchema = tpl?.field_schema ?? tpl?.fields_json ?? tpl?.schema;
        const templateFields = Array.isArray(rawSchema) ? rawSchema
          : rawSchema?.fields || [];
        console.log('[SpotCapture] Template response keys:', Object.keys(tpl || {}));
        console.log('[SpotCapture] Fields extracted:', templateFields.length, templateFields.map(f => f.name));
        setFields(templateFields);
        // Set defaults
        const defaults = {};
        templateFields.forEach(f => {
          if (f.default !== undefined && f.default !== null) defaults[f.name] = f.default;
        });
        console.log('[SpotCapture] Defaults:', JSON.stringify(defaults));
        setValues(defaults);
        if (existingSpots) setSpots(Array.isArray(existingSpots) ? existingSpots : []);

        // Load reference data for fields with options_source
        const sourcesNeeded = templateFields
          .filter(f => f.options_source?.catalog)
          .map(f => f.options_source.catalog);
        const uniqueSources = [...new Set(sourcesNeeded)];
        if (uniqueSources.length > 0) {
          const refResults = await Promise.all(
            uniqueSources.map(src =>
              (src === 'el_stage' ? observationService.getElStages() : observationService.getCatalog(src))
                .catch(e => { console.log('[SpotCapture] Catalog fetch failed:', src, e.message); return []; })
            )
          );
          const refMap = {};
          uniqueSources.forEach((src, i) => {
            const items = Array.isArray(refResults[i]) ? refResults[i] : [];
            console.log(`[SpotCapture] Catalog '${src}': ${items.length} items`);
            refMap[src] = items;
          });
          setReferenceData(refMap);
        }
      } catch (err) {
        console.log('Failed to load template:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId, runId]);

  // Set up navigation header — olive themed per wireframe
  useEffect(() => {
    navigation.setOptions({
      title: '',
      headerStyle: { backgroundColor: colors.headerObs },
      headerShadowVisible: false,
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: spacing.md }}>
          <Feather name="chevron-left" size={20} color={colors.white} />
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: fontSize.base }}>{planName || 'Observation'}</Text>
        </TouchableOpacity>
      ),
      headerRight: () => spots.length > 0 ? (
        <View style={{ backgroundColor: colors.successBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: colors.success }}>{spots.length} saved</Text>
        </View>
      ) : null,
    });
  }, [navigation, planName, spots.length]);

  // Auto-grab GPS
  useEffect(() => { grabGps(); }, []);

  const grabGps = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
        setGps({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy });
      }
    } catch (err) {
      console.log('GPS error:', err.message);
    } finally {
      setGpsLoading(false);
    }
  };

  const updateValue = (fieldName, val) => {
    setValues(prev => ({ ...prev, [fieldName]: val }));
  };

  const handleSaveSpot = async () => {
    setSaving(true);
    try {
      // Create run on first spot save (deferred creation — avoids orphan empty runs)
      let activeRunId = runId;
      if (!activeRunId) {
        const run = await observationService.createRun({
          company_id: companyId || template?.company_id,
          template_id: templateId,
          block_id: blockId || undefined,
          plan_id: planId || undefined,
        });
        activeRunId = run.id;
        setRunId(activeRunId);
      }

      const spot = await observationService.createSpot(activeRunId, {
        company_id: companyId || template?.company_id || undefined,
        block_id: blockId || undefined,
        latitude: gps?.latitude || undefined,
        longitude: gps?.longitude || undefined,
        observed_at: new Date().toISOString(),
        values,
        notes: notes || undefined,
        photo_file_ids: imageCapture.uploadedFiles.map(f => f.file_id || f.id) || [],
      });

      // Upload any pending photos
      if (imageCapture.images.length > 0) {
        await imageCapture.uploadAll(spot.id);
      }

      setSpots(prev => [...prev, spot]);

      // Reset form for next spot
      const defaults = {};
      fields.forEach(f => {
        if (f.default !== undefined && f.default !== null) defaults[f.name] = f.default;
      });
      setValues(defaults);
      setNotes('');
      imageCapture.reset();
      grabGps(); // refresh GPS for next spot

      Alert.alert('Spot Saved', `Spot #${spots.length + 1} recorded.`, [
        { text: 'Add Another', style: 'default' },
        { text: 'Finish Run', onPress: handleCompleteRun },
      ]);
    } catch (err) {
      const detail = err.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Failed to save spot');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteRun = async () => {
    try {
      await observationService.completeRun(runId);
      Alert.alert('Run Complete', `${spots.length + 1} spot${spots.length > 0 ? 's' : ''} recorded.`);
      navigation.goBack();
    } catch (err) {
      // If complete fails, still go back
      navigation.goBack();
    }
  };

  // --- Helpers ---

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateTime = (iso) => {
    if (!iso) return '';
    return `${formatDate(iso)}, ${formatTime(iso)}`;
  };

  // Get resolved options for a field (static options or from reference data)
  const getFieldOptions = (field) => {
    if (field.options_source?.catalog) {
      const items = referenceData[field.options_source.catalog] || [];
      return items.map(item => ({
        value: item.key || String(item.id),
        label: item.label || item.key || String(item.id),
        description: item.description || null,
      }));
    }
    return (field.options || []).map(opt =>
      typeof opt === 'string' ? { value: opt, label: opt } : opt
    );
  };

  // --- Dynamic field renderers ---

  const renderField = (field) => {
    // Skip scope fields handled elsewhere
    if (field.type === 'entity_ref') return null; // block/asset — already selected
    if (field.type === 'photo_multi') return null; // handled by PhotoStrip
    if (field.computed) return null;

    // Check visibility rules
    if (field.visible_if) {
      const entries = Object.entries(field.visible_if);
      for (const [depField, depValue] of entries) {
        if (depField === 'field' && field.visible_if.value !== undefined) {
          // legacy format: { field: 'x', value: 'y' }
          if (values[field.visible_if.field] !== field.visible_if.value) return null;
          break;
        }
        // object format: { scale: 'EL' }
        if (values[depField] !== depValue) return null;
      }
    }

    const val = values[field.name];
    const hasOptionsSource = !!field.options_source?.catalog;
    const isMulti = field.multiselect || field.type === 'multiselect';

    switch (field.type) {
      case 'number':
      case 'integer':
      case 'decimal': {
        // Small integer ranges (e.g. severity 0-5) render as tap-to-select buttons
        const hasRange = field.min != null && field.max != null;
        const rangeSize = hasRange ? (field.max - field.min) : Infinity;
        if (hasRange && rangeSize <= 10 && Number.isInteger(field.min) && Number.isInteger(field.max)) {
          const options = [];
          for (let i = field.min; i <= field.max; i++) options.push(i);
          return (
            <FieldWrapper key={field.name} field={field}>
              <View style={styles.selectGrid}>
                {options.map(n => {
                  const selected = val === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.scaleBtn, selected && styles.scaleBtnActive]}
                      onPress={() => updateValue(field.name, selected ? null : n)}
                    >
                      <Text style={[styles.scaleBtnText, selected && styles.scaleBtnTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FieldWrapper>
          );
        }
        return (
          <FieldWrapper key={field.name} field={field}>
            <TextInput
              style={styles.input}
              value={val != null ? String(val) : ''}
              onChangeText={v => updateValue(field.name, v === '' ? null : parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder={field.unit ? `(${field.unit})` : '0'}
              placeholderTextColor={colors.textMuted}
            />
          </FieldWrapper>
        );
      }

      case 'text':
        return (
          <FieldWrapper key={field.name} field={field}>
            <TextInput
              style={styles.input}
              value={val || ''}
              onChangeText={v => updateValue(field.name, v)}
              placeholder={field.help_text || ''}
              placeholderTextColor={colors.textMuted}
            />
          </FieldWrapper>
        );

      case 'textarea':
        return (
          <FieldWrapper key={field.name} field={field}>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={val || ''}
              onChangeText={v => updateValue(field.name, v)}
              placeholder={field.help_text || ''}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </FieldWrapper>
        );

      case 'boolean':
        return (
          <FieldWrapper key={field.name} field={field}>
            <Switch
              value={!!val}
              onValueChange={v => updateValue(field.name, v)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          </FieldWrapper>
        );

      case 'select': {
        // Route select fields with multiselect flag to the multiselect renderer
        if (isMulti) {
          // Fall through to multiselect case by re-rendering
          const options = hasOptionsSource ? getFieldOptions(field) : getFieldOptions(field);
          if (hasOptionsSource) {
            const selected = Array.isArray(val) ? val : [];
            const selectedLabels = selected.map(v => {
              const o = options.find(opt => opt.value === v);
              return o ? o.label : v;
            });
            return (
              <FieldWrapper key={field.name} field={field}>
                <TouchableOpacity
                  style={styles.pickerTrigger}
                  onPress={() => { setPickerField({ ...field, _isMulti: true }); setPickerSearch(''); }}
                >
                  <Text style={selected.length > 0 ? styles.pickerValue : styles.pickerPlaceholder} numberOfLines={2}>
                    {selected.length > 0 ? selectedLabels.join(', ') : `Select ${field.label}...`}
                  </Text>
                  <Text style={styles.pickerChevron}>▼</Text>
                </TouchableOpacity>
              </FieldWrapper>
            );
          }
          return (
            <FieldWrapper key={field.name} field={field}>
              <View style={styles.selectGrid}>
                {options.map(opt => {
                  const selected = Array.isArray(val) && val.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.selectBtn, selected && styles.selectBtnActive]}
                      onPress={() => {
                        const current = Array.isArray(val) ? val : [];
                        updateValue(field.name, selected ? current.filter(v => v !== opt.value) : [...current, opt.value]);
                      }}
                    >
                      <Text style={[styles.selectBtnText, selected && styles.selectBtnTextActive]} numberOfLines={1}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FieldWrapper>
          );
        }
        // If options come from a catalog, use the picker modal (list may be long)
        if (hasOptionsSource) {
          const options = getFieldOptions(field);
          const selectedOpt = options.find(o => o.value === val);
          return (
            <FieldWrapper key={field.name} field={field}>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => { setPickerField(field); setPickerSearch(''); }}
              >
                <Text style={selectedOpt ? styles.pickerValue : styles.pickerPlaceholder} numberOfLines={1}>
                  {selectedOpt ? selectedOpt.label : `Select ${field.label}...`}
                </Text>
                <Text style={styles.pickerChevron}>▼</Text>
              </TouchableOpacity>
              {selectedOpt?.description && field.show_guide && (
                <Text style={styles.refDescription}>{selectedOpt.description}</Text>
              )}
            </FieldWrapper>
          );
        }
        // Static options — render as button grid (short lists)
        const options = getFieldOptions(field);
        return (
          <FieldWrapper key={field.name} field={field}>
            <View style={styles.selectGrid}>
              {options.map(opt => {
                const selected = val === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.selectBtn, selected && styles.selectBtnActive]}
                    onPress={() => updateValue(field.name, selected ? null : opt.value)}
                  >
                    <Text style={[styles.selectBtnText, selected && styles.selectBtnTextActive]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FieldWrapper>
        );
      }

      case 'multiselect': {
        const options = hasOptionsSource ? getFieldOptions(field) : getFieldOptions(field);
        if (hasOptionsSource) {
          // Catalog-backed multiselect — picker modal
          const selected = Array.isArray(val) ? val : [];
          const selectedLabels = selected.map(v => {
            const o = options.find(opt => opt.value === v);
            return o ? o.label : v;
          });
          return (
            <FieldWrapper key={field.name} field={field}>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => { setPickerField({ ...field, _isMulti: true }); setPickerSearch(''); }}
              >
                <Text style={selected.length > 0 ? styles.pickerValue : styles.pickerPlaceholder} numberOfLines={2}>
                  {selected.length > 0 ? selectedLabels.join(', ') : `Select ${field.label}...`}
                </Text>
                <Text style={styles.pickerChevron}>▼</Text>
              </TouchableOpacity>
            </FieldWrapper>
          );
        }
        // Static multiselect — chip grid
        return (
          <FieldWrapper key={field.name} field={field}>
            <View style={styles.selectGrid}>
              {options.map(opt => {
                const selected = Array.isArray(val) && val.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.selectBtn, selected && styles.selectBtnActive]}
                    onPress={() => {
                      const current = Array.isArray(val) ? val : [];
                      updateValue(field.name, selected ? current.filter(v => v !== opt.value) : [...current, opt.value]);
                    }}
                  >
                    <Text style={[styles.selectBtnText, selected && styles.selectBtnTextActive]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FieldWrapper>
        );
      }

      case 'date':
        return (
          <FieldWrapper key={field.name} field={field}>
            <TouchableOpacity
              style={styles.pickerTrigger}
              onPress={() => setShowDatePicker({ fieldName: field.name, mode: 'date', step: 'date' })}
            >
              <Text style={val ? styles.pickerValue : styles.pickerPlaceholder}>
                {val ? formatDate(val) : 'Tap to select date'}
              </Text>
              <Text style={styles.pickerChevron}>📅</Text>
            </TouchableOpacity>
          </FieldWrapper>
        );

      case 'time':
        return (
          <FieldWrapper key={field.name} field={field}>
            <TouchableOpacity
              style={styles.pickerTrigger}
              onPress={() => setShowDatePicker({ fieldName: field.name, mode: 'time', step: 'time' })}
            >
              <Text style={val ? styles.pickerValue : styles.pickerPlaceholder}>
                {val ? formatTime(val) : 'Tap to select time'}
              </Text>
              <Text style={styles.pickerChevron}>🕐</Text>
            </TouchableOpacity>
          </FieldWrapper>
        );

      case 'datetime':
        return (
          <FieldWrapper key={field.name} field={field}>
            <TouchableOpacity
              style={styles.pickerTrigger}
              onPress={() => setShowDatePicker({ fieldName: field.name, mode: 'datetime', step: 'date' })}
            >
              <Text style={val ? styles.pickerValue : styles.pickerPlaceholder}>
                {val ? formatDateTime(val) : 'Tap to select date & time'}
              </Text>
              <Text style={styles.pickerChevron}>📅</Text>
            </TouchableOpacity>
          </FieldWrapper>
        );

      case 'json':
        // JSON fields are power-user/web — hide on mobile
        return null;

      default:
        // Fallback: render as text input
        return (
          <FieldWrapper key={field.name} field={field}>
            <TextInput
              style={styles.input}
              value={val != null ? String(val) : ''}
              onChangeText={v => updateValue(field.name, v)}
              placeholder={field.help_text || field.type}
              placeholderTextColor={colors.textMuted}
            />
          </FieldWrapper>
        );
    }
  };

  // --- Reference data picker modal ---

  const renderPickerModal = () => {
    if (!pickerField) return null;
    const options = getFieldOptions(pickerField);
    const isMulti = pickerField._isMulti || pickerField.multiselect || pickerField.type === 'multiselect';
    const currentVal = values[pickerField.name];
    const selectedValues = isMulti ? (Array.isArray(currentVal) ? currentVal : []) : [];

    const query = pickerSearch.toLowerCase().trim();
    const filtered = query
      ? options.filter(o =>
          o.label.toLowerCase().includes(query) ||
          o.value.toLowerCase().includes(query) ||
          (o.description && o.description.toLowerCase().includes(query))
        )
      : options;

    return (
      <Modal visible={true} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pickerField.label}</Text>

            {/* Search bar */}
            <TextInput
              style={[styles.input, { marginBottom: spacing.sm }]}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <FlatList
              data={filtered}
              keyExtractor={o => o.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: opt }) => {
                const selected = isMulti
                  ? selectedValues.includes(opt.value)
                  : currentVal === opt.value;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selected && styles.pickerItemActive]}
                    onPress={() => {
                      if (isMulti) {
                        const next = selected
                          ? selectedValues.filter(v => v !== opt.value)
                          : [...selectedValues, opt.value];
                        updateValue(pickerField.name, next);
                      } else {
                        updateValue(pickerField.name, selected ? null : opt.value);
                        setPickerField(null);
                      }
                    }}
                  >
                    {isMulti && (
                      <Text style={styles.pickerCheck}>{selected ? '☑' : '☐'}</Text>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemLabel, selected && styles.pickerItemLabelActive]}>
                        {opt.label}
                      </Text>
                      {opt.description && pickerField.show_guide && (
                        <Text style={styles.pickerItemDesc} numberOfLines={2}>{opt.description}</Text>
                      )}
                    </View>
                    {!isMulti && selected && (
                      <Feather name="check" size={18} color={colors.success} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No matches</Text>
              }
            />

            {/* Allow free-text entry for allow_free fields */}
            {pickerField.allow_free && pickerSearch.trim() && !filtered.some(o => o.value === pickerSearch.trim()) && (
              <TouchableOpacity
                style={[styles.pickerItem, { borderTopWidth: 1, borderTopColor: colors.border }]}
                onPress={() => {
                  const custom = pickerSearch.trim();
                  if (isMulti) {
                    updateValue(pickerField.name, [...selectedValues, custom]);
                  } else {
                    updateValue(pickerField.name, custom);
                  }
                  setPickerField(null);
                }}
              >
                <Text style={styles.pickerItemLabel}>+ Add "{pickerSearch.trim()}"</Text>
              </TouchableOpacity>
            )}

            {/* Done / Cancel buttons */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              {isMulti && (
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]}
                  onPress={() => setPickerField(null)}
                >
                  <Text style={styles.modalBtnText}>Done ({selectedValues.length})</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1, backgroundColor: colors.border }]}
                onPress={() => setPickerField(null)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // --- Date/time picker handling ---

  const handleDateTimeChange = (event, selectedDate) => {
    if (!showDatePicker || event.type === 'dismissed') {
      setShowDatePicker(null);
      return;
    }
    const { fieldName, mode, step } = showDatePicker;

    if (mode === 'date') {
      updateValue(fieldName, selectedDate.toISOString());
      setShowDatePicker(null);
    } else if (mode === 'time') {
      updateValue(fieldName, selectedDate.toISOString());
      setShowDatePicker(null);
    } else if (mode === 'datetime') {
      if (step === 'date') {
        // Store interim date, then show time picker
        updateValue(fieldName, selectedDate.toISOString());
        setShowDatePicker({ fieldName, mode: 'datetime', step: 'time' });
      } else {
        // Merge the time into the existing date
        const existing = values[fieldName] ? new Date(values[fieldName]) : new Date();
        existing.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        updateValue(fieldName, existing.toISOString());
        setShowDatePicker(null);
      }
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const hasUnsavedData = Object.values(values).some(v => v != null && v !== '') || notes.trim() || imageCapture.images.length > 0;

  return (
    <View style={styles.container}>
      {/* Sub-header with block info */}
      <View style={styles.subHeader}>
        <Text style={styles.subHeaderTitle}>New Observation</Text>
        <Text style={styles.subHeaderSubtitle}>
          {blockName || 'No block'}{template?.type ? ` · ${templateName}` : ''}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Spot card — wraps GPS + fields + photos + timestamp */}
            <View style={styles.content}>
              <SectionCard
                icon="map-pin"
                title={`Spot ${runId ? '' : '(unsaved)'}`}
                subtitle={`${blockName || 'Block'}${spots.length > 0 ? ` · ${spots.length} saved` : ''}`}
                badge={hasUnsavedData ? 'Unsaved' : null}
                badgeColor="warning"
              >
                {/* GPS Section */}
                {gpsLoading ? (
                  <View style={styles.gpsLoadingRow}>
                    <ActivityIndicator size="small" color={colors.gps} />
                    <Text style={{ color: colors.gps, fontSize: fontSize.sm }}>Acquiring GPS...</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={grabGps} activeOpacity={0.7}>
                    <GpsSection
                      latitude={gps?.latitude}
                      longitude={gps?.longitude}
                      accuracy={gps?.accuracy}
                      isLocked={gps != null}
                    />
                  </TouchableOpacity>
                )}

                {/* Dynamic template fields */}
                {fields.map(renderField)}

                {/* Notes */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional notes..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                {/* Photos */}
                <PhotoGrid
                  photos={imageCapture.images}
                  maxPhotos={5}
                  onAddPhoto={imageCapture.showPicker}
                  onRemovePhoto={imageCapture.removeImage}
                  label="Photos"
                />

                {/* Timestamp */}
                <View style={styles.timestampRow}>
                  <Feather name="clock" size={14} color={colors.textMuted} />
                  <Text style={styles.timestampText}>
                    {new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </SectionCard>

              {/* Continue later link */}
              {spots.length > 0 && (
                <TouchableOpacity
                  style={styles.continueLater}
                  onPress={() => {
                    Alert.alert(
                      'Continue Later?',
                      'Your spots are saved. You can resume this run from the Observe tab.',
                      [
                        { text: 'Stay', style: 'cancel' },
                        { text: 'Save & Leave', onPress: () => navigation.goBack() },
                      ]
                    );
                  }}
                >
                  <Feather name="pause-circle" size={14} color={colors.textMuted} />
                  <Text style={styles.continueLaterText}>Continue later</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Fixed bottom action bar */}
      <BottomActionBar
        primaryLabel={saving ? 'Saving...' : 'Save'}
        primaryIcon="save"
        onPrimary={handleSaveSpot}
        disabled={saving}
        secondaryLabel={spots.length > 0 ? `Finish (${spots.length})` : 'Add Spot'}
        secondaryIcon={spots.length > 0 ? 'check-circle' : 'plus'}
        onSecondary={spots.length > 0 ? handleCompleteRun : handleSaveSpot}
      />

      {/* Reference data picker modal */}
      {renderPickerModal()}

      {/* Date/time picker */}
      {showDatePicker && (
        <DateTimePicker
          value={values[showDatePicker.fieldName] ? new Date(values[showDatePicker.fieldName]) : new Date()}
          mode={showDatePicker.step === 'time' ? 'time' : 'date'}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateTimeChange}
        />
      )}
    </View>
  );
}

// --- Field wrapper with label ---
function FieldWrapper({ field, children }) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>
          {field.label || field.name}{field.required ? ' *' : ''}
        </Text>
        {field.unit && <Text style={styles.fieldUnit}>{field.unit}</Text>}
      </View>
      {field.help_text && field.type !== 'text' && field.type !== 'textarea' && (
        <Text style={styles.fieldHelp}>{field.help_text}</Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundWarm },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.base },

  // Sub-header (below nav, olive themed)
  subHeader: {
    backgroundColor: colors.headerObs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  subHeaderTitle: { color: colors.white, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subHeaderSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },

  // GPS loading
  gpsLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.md },

  // Timestamp row
  timestampRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.background, borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  timestampText: { fontSize: fontSize.sm, color: colors.textMuted },

  // Continue later
  continueLater: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.md,
  },
  continueLaterText: { fontSize: fontSize.sm, color: colors.textMuted },

  // Fields (kept from original)
  fieldWrap: { marginBottom: spacing.md },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  fieldUnit: { fontSize: fontSize.xs, color: colors.textMuted },
  fieldHelp: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.xs, fontStyle: 'italic' },

  // Inputs
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.white,
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },

  // Select buttons
  selectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selectBtn: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  selectBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectBtnText: { fontSize: fontSize.xs, color: colors.textMuted },
  selectBtnTextActive: { color: colors.white, fontWeight: '500' },

  // Scale buttons (severity 0-5, etc.)
  scaleBtn: {
    width: 44, height: 44, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  scaleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scaleBtnText: { fontSize: fontSize.base, fontWeight: '600', color: colors.textMuted },
  scaleBtnTextActive: { color: colors.white },

  // Picker trigger (for options_source and date/time fields)
  pickerTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, backgroundColor: colors.white, minHeight: 44,
  },
  pickerValue: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  pickerPlaceholder: { fontSize: fontSize.sm, color: colors.textMuted, flex: 1 },
  pickerChevron: { fontSize: fontSize.xs, color: colors.textMuted, marginLeft: spacing.xs },
  refDescription: { fontSize: fontSize.xs, color: colors.info, marginTop: 2, fontStyle: 'italic' },

  // Picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, maxHeight: '75%',
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  modalBtn: { paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  modalBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic', padding: spacing.md, textAlign: 'center' },

  // Picker list items
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerItemActive: { backgroundColor: colors.primary + '10' },
  pickerItemLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '400' },
  pickerItemLabelActive: { fontWeight: '600', color: colors.primary },
  pickerItemDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  pickerCheck: { fontSize: fontSize.base, color: colors.primary },
});
