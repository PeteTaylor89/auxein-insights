// screens/SpotCaptureScreen.js — Capture observation spots with dynamic template fields
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import * as Location from 'expo-location';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { observationService } from '../api/services';
import useImageCapture from '../hooks/useImageCapture';
import PhotoStrip from '../components/PhotoStrip';

export default function SpotCaptureScreen({ route, navigation }) {
  const { runId, templateId, blockId, blockName, templateName, planName } = route.params;

  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const imageCapture = useImageCapture('observation_spot', null);

  // Load template and existing spots
  useEffect(() => {
    (async () => {
      try {
        const [tpl, existingSpots] = await Promise.all([
          observationService.getTemplate(templateId),
          observationService.getSpots(runId).catch(() => []),
        ]);
        setTemplate(tpl);
        const templateFields = tpl?.schema?.fields || tpl?.fields_json?.fields || [];
        setFields(templateFields);
        // Set defaults
        const defaults = {};
        templateFields.forEach(f => {
          if (f.default !== undefined && f.default !== null) defaults[f.name] = f.default;
        });
        setValues(defaults);
        setSpots(Array.isArray(existingSpots) ? existingSpots : []);
      } catch (err) {
        console.log('Failed to load template:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId, runId]);

  // Set up navigation header
  useEffect(() => {
    navigation.setOptions({
      title: templateName || 'Capture Spot',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingRight: spacing.md }}>
          <Text style={{ color: colors.primary, fontSize: fontSize.base }}>← Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, templateName]);

  // Auto-grab GPS
  useEffect(() => { grabGps(); }, []);

  const grabGps = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setGps({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
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
      const spot = await observationService.createSpot(runId, {
        company_id: template?.company_id || undefined,
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

  // --- Dynamic field renderers ---

  const renderField = (field) => {
    // Check visibility rules
    if (field.visible_if) {
      const depField = field.visible_if.field;
      const depValue = field.visible_if.value;
      if (values[depField] !== depValue) return null;
    }

    const val = values[field.name];

    switch (field.type) {
      case 'number':
      case 'integer':
      case 'decimal':
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

      case 'select':
        return (
          <FieldWrapper key={field.name} field={field}>
            <View style={styles.selectGrid}>
              {(field.options || []).map(opt => {
                const optVal = typeof opt === 'string' ? opt : opt.value;
                const optLabel = typeof opt === 'string' ? opt : opt.label;
                const selected = val === optVal;
                return (
                  <TouchableOpacity
                    key={optVal}
                    style={[styles.selectBtn, selected && styles.selectBtnActive]}
                    onPress={() => updateValue(field.name, selected ? null : optVal)}
                  >
                    <Text style={[styles.selectBtnText, selected && styles.selectBtnTextActive]} numberOfLines={1}>
                      {optLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FieldWrapper>
        );

      case 'multiselect':
        return (
          <FieldWrapper key={field.name} field={field}>
            <View style={styles.selectGrid}>
              {(field.options || []).map(opt => {
                const optVal = typeof opt === 'string' ? opt : opt.value;
                const optLabel = typeof opt === 'string' ? opt : opt.label;
                const selected = Array.isArray(val) && val.includes(optVal);
                return (
                  <TouchableOpacity
                    key={optVal}
                    style={[styles.selectBtn, selected && styles.selectBtnActive]}
                    onPress={() => {
                      const current = Array.isArray(val) ? val : [];
                      updateValue(field.name, selected ? current.filter(v => v !== optVal) : [...current, optVal]);
                    }}
                  >
                    <Text style={[styles.selectBtnText, selected && styles.selectBtnTextActive]} numberOfLines={1}>
                      {optLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FieldWrapper>
        );

      default:
        // Fallback: render as text input
        if (field.computed) return null; // skip computed fields
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header info */}
          <View style={styles.headerCard}>
            <Text style={styles.headerTemplate}>{templateName}</Text>
            {blockName && <Text style={styles.headerBlock}>{blockName}</Text>}
            {planName && <Text style={styles.headerPlan}>Plan: {planName}</Text>}
            <View style={styles.gpsRow}>
              <Text style={styles.gpsLabel}>GPS:</Text>
              {gpsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : gps ? (
                <Text style={styles.gpsValue}>{gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}</Text>
              ) : (
                <TouchableOpacity onPress={grabGps}>
                  <Text style={styles.gpsRetry}>Tap to capture</Text>
                </TouchableOpacity>
              )}
            </View>
            {spots.length > 0 && (
              <Text style={styles.spotCount}>{spots.length} spot{spots.length > 1 ? 's' : ''} recorded</Text>
            )}
          </View>

          {/* Dynamic template fields */}
          <View style={styles.fieldsSection}>
            {fields.filter(f => !f.computed).map(renderField)}
          </View>

          {/* Notes */}
          <View style={styles.notesSection}>
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
          <View style={styles.photoSection}>
            <PhotoStrip
              images={imageCapture.images}
              onAdd={imageCapture.showPicker}
              onRemove={imageCapture.removeImage}
              uploading={imageCapture.uploading}
            />
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={handleSaveSpot}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.actionBtnText}>Save Spot</Text>
              )}
            </TouchableOpacity>
            {spots.length > 0 && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSuccess]} onPress={handleCompleteRun}>
                <Text style={styles.actionBtnText}>Finish Run ({spots.length})</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
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
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header card
  headerCard: {
    backgroundColor: colors.primary, padding: spacing.base,
  },
  headerTemplate: { color: colors.white, fontSize: fontSize.lg, fontWeight: '600' },
  headerBlock: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm, marginTop: 2 },
  headerPlan: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, marginTop: 2, fontStyle: 'italic' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  gpsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
  gpsValue: { color: colors.white, fontSize: fontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  gpsRetry: { color: colors.white, fontSize: fontSize.xs, textDecorationLine: 'underline' },
  spotCount: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing.xs },

  // Fields
  fieldsSection: { padding: spacing.base },
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

  // Notes & photos
  notesSection: { paddingHorizontal: spacing.base },
  photoSection: { paddingHorizontal: spacing.base, marginTop: spacing.sm },

  // Actions
  actions: {
    padding: spacing.base, gap: spacing.sm,
  },
  actionBtn: { paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnSuccess: { backgroundColor: colors.success },
  actionBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },
});
