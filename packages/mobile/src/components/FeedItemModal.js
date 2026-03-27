// components/FeedItemModal.js — Detail/action modal for maintenance, calibration, risk actions
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform,
} from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { maintenanceService, calibrationService, riskActionService } from '../api/services';
import useImageCapture from '../hooks/useImageCapture';
import PhotoStrip from './PhotoStrip';

const SOURCE_CONFIG = {
  maintenance: { accent: '#E67E22', label: 'Maintenance', icon: '🔧' },
  calibration: { accent: '#8E44AD', label: 'Calibration', icon: '⚙️' },
  risk_action: { accent: '#E74C3C', label: 'Risk Action', icon: '⚠️' },
};

export default function FeedItemModal({ visible, item, onClose, onComplete }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Shared fields
  const [notes, setNotes] = useState('');

  // Maintenance fields
  const [conditionBefore, setConditionBefore] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [conditionAfter, setConditionAfter] = useState('');
  const [assetHours, setAssetHours] = useState('');
  const [assetKms, setAssetKms] = useState('');

  // Calibration fields
  const [measuredValue, setMeasuredValue] = useState('');
  const [adjustmentMade, setAdjustmentMade] = useState(false);
  const [adjustmentDetails, setAdjustmentDetails] = useState('');

  // Risk action fields
  const [progressPct, setProgressPct] = useState('');
  const [actualCost, setActualCost] = useState('');

  const imageCapture = useImageCapture(item?.source, item?.id);

  useEffect(() => {
    if (visible && item) {
      loadDetail();
      resetForm();
    }
  }, [visible, item?.id]);

  const resetForm = () => {
    setNotes('');
    setConditionBefore('');
    setLaborHours('');
    setConditionAfter('');
    setAssetHours('');
    setAssetKms('');
    setMeasuredValue('');
    setAdjustmentMade(false);
    setAdjustmentDetails('');
    setProgressPct('');
    setActualCost('');
    imageCapture.reset();
  };

  const loadDetail = async () => {
    if (!item) return;
    setLoading(true);
    try {
      let data;
      if (item.source === 'maintenance') data = await maintenanceService.get(item.id);
      else if (item.source === 'calibration') data = await calibrationService.get(item.id);
      else if (item.source === 'risk_action') data = await riskActionService.get(item.id);
      setDetail(data);
    } catch (err) {
      console.log('Failed to load detail:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      // Upload photos first
      if (imageCapture.images.length > 0) {
        await imageCapture.uploadAll(item.id);
      }

      if (item.source === 'maintenance') {
        await maintenanceService.complete(item.id, {
          notes: notes || undefined,
          condition_before: conditionBefore || undefined,
          labor_hours: laborHours ? parseFloat(laborHours) : undefined,
          condition_after: conditionAfter || undefined,
          asset_hours_at_maintenance: assetHours ? parseFloat(assetHours) : undefined,
          asset_kilometers_at_maintenance: assetKms ? parseFloat(assetKms) : undefined,
        });
      } else if (item.source === 'calibration') {
        await calibrationService.update(item.id, {
          calibration_date: new Date().toISOString().split('T')[0],
          measured_value: measuredValue ? parseFloat(measuredValue) : undefined,
          status: 'pass',
          within_tolerance: true,
          adjustment_made: adjustmentMade,
          adjustment_details: adjustmentDetails || undefined,
          notes: notes || undefined,
        });
      } else if (item.source === 'risk_action') {
        await riskActionService.complete(item.id, {
          completion_notes: notes || undefined,
          actual_cost: actualCost ? parseFloat(actualCost) : undefined,
          requires_verification: false,
        });
      }

      Alert.alert('Done', `${SOURCE_CONFIG[item.source]?.label} completed.`);
      onComplete?.();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail;
      Alert.alert('Error', typeof msg === 'string' ? msg : 'Failed to complete');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;
  const src = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.maintenance;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.content}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={[styles.header, { borderBottomColor: src.accent }]}>
                <Text style={styles.headerIcon}>{src.icon}</Text>
                <View style={styles.headerText}>
                  <Text style={[styles.headerLabel, { color: src.accent }]}>{src.label}</Text>
                  <Text style={styles.headerTitle}>{item.title}</Text>
                </View>
              </View>

              {loading ? (
                <ActivityIndicator color={src.accent} style={{ padding: spacing.xl }} />
              ) : (
                <View style={styles.body}>
                  {/* Detail fields */}
                  {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

                  <View style={styles.detailGrid}>
                    {item.asset_name && <DetailField label="Asset" value={item.asset_name} />}
                    {item.category && <DetailField label="Category" value={item.category.replace(/_/g, ' ')} />}
                    {item.scheduled_date && (
                      <DetailField
                        label="Due"
                        value={new Date(item.scheduled_date).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                      />
                    )}
                    <DetailField label="Status" value={(item.status || '').replace(/_/g, ' ')} />

                    {/* Source-specific detail fields */}
                    {item.source === 'maintenance' && detail && (
                      <>
                        {detail.condition_before && <DetailField label="Condition Before" value={detail.condition_before} />}
                        {detail.performed_by && <DetailField label="Performed By" value={detail.performed_by} />}
                      </>
                    )}
                    {item.source === 'calibration' && detail && (
                      <>
                        {detail.target_value != null && <DetailField label="Target Value" value={`${detail.target_value} ${detail.unit_of_measure || ''}`} />}
                        {detail.tolerance_min != null && <DetailField label="Tolerance" value={`${detail.tolerance_min} – ${detail.tolerance_max}`} />}
                        {detail.calibrated_by && <DetailField label="Calibrated By" value={detail.calibrated_by} />}
                      </>
                    )}
                    {item.source === 'risk_action' && detail && (
                      <>
                        {detail.action_type && <DetailField label="Type" value={detail.action_type} />}
                        {detail.control_type && <DetailField label="Control" value={detail.control_type} />}
                        {detail.estimated_cost != null && <DetailField label="Est. Cost" value={`$${detail.estimated_cost}`} />}
                      </>
                    )}
                  </View>

                  {/* Action form */}
                  <View style={styles.formSection}>
                    <Text style={[styles.formTitle, { color: src.accent }]}>Complete {src.label}</Text>

                    {/* Maintenance-specific inputs */}
                    {item.source === 'maintenance' && (
                      <>
                        <Text style={styles.inputLabel}>Condition Before</Text>
                        <ConditionPicker value={conditionBefore} onChange={setConditionBefore} />
                        <Text style={styles.inputLabel}>Labour Hours</Text>
                        <TextInput
                          style={styles.input}
                          value={laborHours}
                          onChangeText={setLaborHours}
                          keyboardType="decimal-pad"
                          placeholder="0.0"
                          placeholderTextColor={colors.textMuted}
                        />
                        <Text style={styles.inputLabel}>Condition After</Text>
                        <ConditionPicker value={conditionAfter} onChange={setConditionAfter} />
                        <View style={styles.inputRow}>
                          <View style={styles.inputHalf}>
                            <Text style={styles.inputLabel}>Asset Hours</Text>
                            <TextInput
                              style={styles.input}
                              value={assetHours}
                              onChangeText={setAssetHours}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                            />
                          </View>
                          <View style={styles.inputHalf}>
                            <Text style={styles.inputLabel}>Asset Kms</Text>
                            <TextInput
                              style={styles.input}
                              value={assetKms}
                              onChangeText={setAssetKms}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                            />
                          </View>
                        </View>
                        <View style={styles.infoBox}>
                          <Text style={styles.infoText}>
                            Detailed costs, parts used, and compliance info can be added on the Auxein Grow web app.
                          </Text>
                        </View>
                      </>
                    )}

                    {/* Calibration-specific inputs */}
                    {item.source === 'calibration' && (
                      <>
                        <Text style={styles.inputLabel}>
                          Measured Value {detail?.unit_of_measure ? `(${detail.unit_of_measure})` : ''}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={measuredValue}
                          onChangeText={setMeasuredValue}
                          keyboardType="decimal-pad"
                          placeholder={detail?.target_value != null ? `Target: ${detail.target_value}` : '0.0'}
                          placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.toggleBtn, adjustmentMade && styles.toggleBtnActive]}
                          onPress={() => setAdjustmentMade(!adjustmentMade)}
                        >
                          <Text style={[styles.toggleBtnText, adjustmentMade && styles.toggleBtnTextActive]}>
                            {adjustmentMade ? 'Adjustment Made' : 'Make Adjustment'}
                          </Text>
                        </TouchableOpacity>
                        {adjustmentMade && (
                          <>
                            <Text style={styles.inputLabel}>Adjustment Details</Text>
                            <TextInput
                              style={[styles.input, styles.multiline]}
                              value={adjustmentDetails}
                              onChangeText={setAdjustmentDetails}
                              placeholder="Describe adjustment..."
                              placeholderTextColor={colors.textMuted}
                              multiline
                            />
                          </>
                        )}
                      </>
                    )}

                    {/* Risk action-specific inputs */}
                    {item.source === 'risk_action' && (
                      <>
                        <Text style={styles.inputLabel}>Actual Cost ($)</Text>
                        <TextInput
                          style={styles.input}
                          value={actualCost}
                          onChangeText={setActualCost}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor={colors.textMuted}
                        />
                      </>
                    )}

                    {/* Shared notes */}
                    <Text style={styles.inputLabel}>Notes</Text>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Completion notes..."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={3}
                    />

                    {/* Photo capture */}
                    <PhotoStrip
                      images={imageCapture.images}
                      onAdd={imageCapture.showPicker}
                      onRemove={imageCapture.removeImage}
                      uploading={imageCapture.uploading}
                    />
                  </View>
                </View>
              )}

              {/* Action buttons */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); onClose(); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: src.accent }]}
                  onPress={handleComplete}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.completeBtnText}>Complete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

function ConditionPicker({ value, onChange }) {
  return (
    <View style={styles.conditionRow}>
      {CONDITIONS.map(c => (
        <TouchableOpacity
          key={c}
          style={[styles.conditionBtn, value === c && styles.conditionBtnActive]}
          onPress={() => onChange(value === c ? '' : c)}
        >
          <Text style={[styles.conditionBtnText, value === c && styles.conditionBtnTextActive]}>{c}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function DetailField({ label, value }) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{String(value || '-').replace(/_/g, ' ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '90%',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, borderBottomWidth: 2,
  },
  headerIcon: { fontSize: 28 },
  headerText: { flex: 1 },
  headerLabel: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginTop: 2 },

  // Body
  body: { padding: spacing.lg },
  description: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },

  // Detail grid
  detailGrid: { gap: spacing.xs, marginBottom: spacing.lg },
  detailField: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  detailLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  detailValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, textTransform: 'capitalize' },

  // Form
  formSection: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  formTitle: { fontSize: fontSize.base, fontWeight: '600', marginBottom: spacing.md },
  inputLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.white,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },

  // Condition picker
  conditionRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  conditionBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    backgroundColor: colors.white,
  },
  conditionBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  conditionBtnText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  conditionBtnTextActive: { color: colors.white },

  // Input row (side by side)
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  inputHalf: { flex: 1 },

  // Info box
  infoBox: {
    backgroundColor: colors.oliveLight || '#f0f0e8', borderRadius: radius.sm,
    padding: spacing.md, marginTop: spacing.md,
  },
  infoText: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },

  // Toggle button
  toggleBtn: {
    marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleBtnText: { fontSize: fontSize.sm, color: colors.textMuted },
  toggleBtnTextActive: { color: colors.white, fontWeight: '500' },

  // Actions
  actions: {
    flexDirection: 'row', gap: spacing.sm,
    padding: spacing.lg, paddingTop: spacing.md,
  },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  cancelBtnText: { color: colors.text, fontSize: fontSize.base, fontWeight: '500' },
  completeBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center',
  },
  completeBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },
});
