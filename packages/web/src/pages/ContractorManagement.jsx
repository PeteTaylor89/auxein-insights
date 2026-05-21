// src/pages/ContractorManagement.jsx - Contractor Management (Phase B, Grow V1)
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@vineyard/shared';
import { contractorManagementService } from '@vineyard/shared';
import { Users, Shield, Clock, AlertTriangle, ChevronRight, CheckCircle, XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

// ===== STATUS HELPERS =====
const STATUS_COLORS = {
  active: { bg: '#dcfce7', text: '#166534', label: 'Active' },
  pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  suspended: { bg: '#fee2e2', text: '#991b1b', label: 'Suspended' },
  terminated: { bg: '#f3f4f6', text: '#6b7280', label: 'Terminated' },
  assigned: { bg: '#dbeafe', text: '#1e40af', label: 'Assigned' },
  in_progress: { bg: '#fef3c7', text: '#92400e', label: 'In Progress' },
  completed: { bg: '#dcfce7', text: '#166534', label: 'Completed' },
  declined: { bg: '#fee2e2', text: '#991b1b', label: 'Declined' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: '#f3f4f6', text: '#6b7280', label: status };
  return (
    <span style={{ background: s.bg, color: s.text, padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>
      {s.label}
    </span>
  );
}

const INSURANCE_COLORS = {
  current: { bg: '#dcfce7', text: '#166534', label: 'Current' },
  expiring_soon: { bg: '#fef3c7', text: '#92400e', label: 'Expiring Soon' },
  expired: { bg: '#fee2e2', text: '#991b1b', label: 'Expired' },
  unverified: { bg: '#f3f4f6', text: '#6b7280', label: 'Unverified' },
};

function InsuranceBadge({ status }) {
  const s = INSURANCE_COLORS[status] || INSURANCE_COLORS.unverified;
  return (
    <span style={{ background: s.bg, color: s.text, padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>
      {s.label}
    </span>
  );
}

const RISK_COLORS = {
  low: { bg: '#dcfce7', text: '#166534' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  high: { bg: '#fee2e2', text: '#991b1b' },
};

function RiskBadge({ level }) {
  const r = RISK_COLORS[level] || RISK_COLORS.low;
  return (
    <span style={{ background: r.bg, color: r.text, padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>
      {level || 'N/A'}
    </span>
  );
}

// ===== TAB COMPONENTS =====

function ContractorListTab({ contractors, loading, onSelect, statusFilter, setStatusFilter }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading contractors...</div>;
  if (!contractors.length) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>No contractors found.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'active', 'pending', 'suspended'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db', cursor: 'pointer',
              background: statusFilter === f ? '#446145' : '#fff', color: statusFilter === f ? '#fff' : '#374151',
              fontSize: 13, fontWeight: 500,
            }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {contractors.map(c => (
          <div key={c.id} onClick={() => onSelect(c)}
            style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{c.business_name}</span>
                {c.relationship && <StatusBadge status={c.relationship.status} />}
              </div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>
                {c.contact_person} {c.contractor_type ? `- ${c.contractor_type}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
                {c.is_verified && <span style={{ color: '#166534' }}>Verified</span>}
                <InsuranceBadge status={c.insurance_status} />
                <RiskBadge level={c.biosecurity_risk_level} />
                {c.total_jobs_completed > 0 && <span>{c.total_jobs_completed} jobs</span>}
                {c.average_rating > 0 && <span>{c.average_rating.toFixed(1)} rating</span>}
              </div>
            </div>
            <ChevronRight size={18} color="#9ca3af" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractorDetailView({ contractor, onBack, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [movements, setMovements] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [d, a, m] = await Promise.all([
          contractorManagementService.getContractor(contractor.id),
          contractorManagementService.getAssignments(contractor.id),
          contractorManagementService.getMovements(contractor.id),
        ]);
        setDetail(d);
        setAssignments(a);
        setMovements(m);
      } catch (err) {
        console.error('Failed to load contractor detail:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [contractor.id]);

  const handleRelationshipAction = async (action) => {
    if (!detail?.relationship?.id) return;
    try {
      await contractorManagementService.updateRelationship(detail.relationship.id, { status: action });
      const d = await contractorManagementService.getContractor(contractor.id);
      setDetail(d);
      onRefresh();
    } catch (err) {
      console.error(`Failed to ${action} relationship:`, err);
    }
  };

  const handleVerifyInsurance = async () => {
    if (!detail?.relationship?.id) return;
    try {
      await contractorManagementService.verifyInsurance(detail.relationship.id);
      const d = await contractorManagementService.getContractor(contractor.id);
      setDetail(d);
    } catch (err) {
      console.error('Failed to verify insurance:', err);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  if (!detail) return <div style={{ padding: 40, textAlign: 'center', color: '#991b1b' }}>Failed to load contractor.</div>;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'assignments', label: `Assignments (${assignments.length})` },
    { key: 'movements', label: `Movements (${movements.length})` },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#446145', fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
        <ArrowLeft size={16} /> Back to List
      </button>

      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#1f2937' }}>{detail.business_name}</h2>
            <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{detail.contact_person} - {detail.contractor_type}</div>
            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{detail.email} | {detail.phone}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={detail.relationship?.status} />
            <InsuranceBadge status={detail.insurance_status} />
            <RiskBadge level={detail.biosecurity_risk_level} />
          </div>
        </div>

        {/* Relationship actions */}
        {detail.relationship && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
            {detail.relationship.status === 'pending' && (
              <button onClick={() => handleRelationshipAction('active')}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#446145', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                Approve
              </button>
            )}
            {detail.relationship.status === 'active' && (
              <button onClick={() => handleRelationshipAction('suspended')}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#92400e', cursor: 'pointer', fontSize: 13 }}>
                Suspend
              </button>
            )}
            {detail.relationship.status === 'suspended' && (
              <button onClick={() => handleRelationshipAction('active')}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#446145', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Reactivate
              </button>
            )}
            {['active', 'suspended', 'pending'].includes(detail.relationship.status) && (
              <button onClick={() => handleRelationshipAction('terminated')}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff', color: '#991b1b', cursor: 'pointer', fontSize: 13 }}>
                Terminate
              </button>
            )}
            {!detail.is_verified && (
              <button onClick={handleVerifyInsurance}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#1e40af', cursor: 'pointer', fontSize: 13 }}>
                Verify Insurance
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? '#446145' : '#6b7280',
              borderBottom: activeTab === t.key ? '2px solid #446145' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab detail={detail} />}
      {activeTab === 'assignments' && <AssignmentsTab assignments={assignments} />}
      {activeTab === 'movements' && <MovementsTab movements={movements} />}
    </div>
  );
}

function OverviewTab({ detail }) {
  const rel = detail.relationship || {};
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>Business Details</h3>
        <InfoRow label="Business Number" value={detail.business_number} />
        <InfoRow label="Address" value={detail.address} />
        <InfoRow label="Mobile" value={detail.mobile} />
        <InfoRow label="Type" value={detail.contractor_type} />
        <InfoRow label="Specializations" value={(detail.specializations || []).join(', ')} />
        <InfoRow label="Equipment Owned" value={(detail.equipment_owned || []).join(', ')} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>Insurance & Verification</h3>
        <InfoRow label="Public Liability" value={detail.public_liability_insurer} />
        <InfoRow label="Policy #" value={detail.public_liability_policy_number} />
        <InfoRow label="Coverage" value={detail.public_liability_coverage_amount ? `$${detail.public_liability_coverage_amount.toLocaleString()}` : null} />
        <InfoRow label="PL Expiry" value={detail.public_liability_expiry} />
        <InfoRow label="PI Insurer" value={detail.professional_indemnity_insurer} />
        <InfoRow label="PI Expiry" value={detail.professional_indemnity_expiry} />
        <InfoRow label="Workers Comp Expiry" value={detail.workers_comp_expiry} />
        <InfoRow label="Verification" value={detail.verification_level} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>Biosecurity</h3>
        <InfoRow label="Cleaning Protocols" value={detail.has_cleaning_protocols ? 'Yes' : 'No'} />
        <InfoRow label="Approved Disinfectants" value={detail.uses_approved_disinfectants ? 'Yes' : 'No'} />
        <InfoRow label="Multiple Regions" value={detail.works_multiple_regions ? 'Yes' : 'No'} />
        <InfoRow label="High Risk Crops" value={detail.works_with_high_risk_crops ? 'Yes' : 'No'} />
        <InfoRow label="Risk Level" value={detail.biosecurity_risk_level} />
        <InfoRow label="Last Training" value={detail.last_biosecurity_training} />
        <InfoRow label="Cleaning Equipment" value={(detail.cleaning_equipment_owned || []).join(', ')} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>Relationship & Performance</h3>
        <InfoRow label="Type" value={rel.relationship_type} />
        <InfoRow label="Hourly Rate" value={rel.hourly_rate ? `$${rel.hourly_rate}` : null} />
        <InfoRow label="Daily Rate" value={rel.daily_rate ? `$${rel.daily_rate}` : null} />
        <InfoRow label="Contract Start" value={rel.contract_start} />
        <InfoRow label="Contract End" value={rel.contract_end} />
        <InfoRow label="Jobs Completed" value={rel.jobs_completed_for_company} />
        <InfoRow label="Rating" value={rel.company_rating?.toFixed(1)} />
        <InfoRow label="Total Hours" value={rel.total_hours_worked?.toFixed(1)} />
        <InfoRow label="Can Create Observations" value={rel.can_create_observations ? 'Yes' : 'No'} />
        <InfoRow label="Can Update Tasks" value={rel.can_update_tasks ? 'Yes' : 'No'} />
        <InfoRow label="Requires Supervision" value={rel.requires_supervision ? 'Yes' : 'No'} />
        <InfoRow label="Emergency Contact" value={rel.emergency_contact_name} />
        <InfoRow label="Emergency Phone" value={rel.emergency_contact_phone} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f9fafb', fontSize: 13 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: '#1f2937', fontWeight: 500 }}>{String(value)}</span>
    </div>
  );
}

function AssignmentsTab({ assignments }) {
  if (!assignments.length) return <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No assignments found.</div>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {assignments.map(a => (
        <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 500, fontSize: 14 }}>Task #{a.task_id}</span>
              {a.work_description && <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>{a.work_description}</span>}
            </div>
            <StatusBadge status={a.status} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
            {a.priority && <span>Priority: {a.priority}</span>}
            {a.scheduled_start && <span>Start: {a.scheduled_start}</span>}
            {a.scheduled_end && <span>End: {a.scheduled_end}</span>}
            {a.completion_percentage > 0 && <span>{a.completion_percentage}% complete</span>}
            {a.actual_hours_worked > 0 && <span>{a.actual_hours_worked}h worked</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MovementsTab({ movements }) {
  if (!movements.length) return <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No movement records.</div>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {movements.map(m => (
        <div key={m.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{m.purpose || 'Site visit'}</span>
              {m.vehicle_registration && <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>{m.vehicle_registration}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <RiskBadge level={m.biosecurity_risk_level} />
              <StatusBadge status={m.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
            {m.arrival_datetime && <span>In: {new Date(m.arrival_datetime).toLocaleString()}</span>}
            {m.departure_datetime && <span>Out: {new Date(m.departure_datetime).toLocaleString()}</span>}
            {m.hours_worked > 0 && <span>{m.hours_worked}h</span>}
            <span>{m.equipment_cleaned ? 'Equipment cleaned' : 'Equipment not cleaned'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrainingTab({ training }) {
  if (!training.length) return <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No training records.</div>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {training.map(t => (
        <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 500, fontSize: 14 }}>Module #{t.training_module_id}</span>
              {t.priority && <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>({t.priority})</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {t.is_overdue && <AlertTriangle size={14} color="#991b1b" />}
              {t.passed && <CheckCircle size={14} color="#166534" />}
              {t.passed === false && t.status === 'completed' && <XCircle size={14} color="#991b1b" />}
              <StatusBadge status={t.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
            {t.due_date && <span>Due: {t.due_date}</span>}
            {t.score > 0 && <span>Score: {t.score}%</span>}
            {t.progress_percentage > 0 && <span>Progress: {t.progress_percentage}%</span>}
            {t.valid_until && <span>Valid until: {t.valid_until}</span>}
            {t.certificate_issued && <span>Certificate issued</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== MOVEMENTS LIST TAB (company-wide) =====

function MovementsListTab({ loading }) {
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await contractorManagementService.listMovements({ limit: 50 });
        setMovements(data);
      } catch (err) {
        console.error('Failed to load movements:', err);
      } finally {
        setMovementsLoading(false);
      }
    })();
  }, []);

  if (movementsLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading movements...</div>;
  if (!movements.length) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>No movement records.</div>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {movements.map(m => (
        <div key={m.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{m.contractor_name}</span>
              {m.purpose && <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>- {m.purpose}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <RiskBadge level={m.biosecurity_risk_level} />
              <StatusBadge status={m.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
            {m.arrival_datetime && <span>In: {new Date(m.arrival_datetime).toLocaleString()}</span>}
            {m.departure_datetime && <span>Out: {new Date(m.departure_datetime).toLocaleString()}</span>}
            {m.hours_worked > 0 && <span>{m.hours_worked}h</span>}
            <span>{m.equipment_cleaned ? 'Cleaned' : 'Not cleaned'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== MAIN PAGE COMPONENT =====

export default function ContractorManagement() {
  const { user } = useAuth();
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageTab, setPageTab] = useState('contractors'); // 'contractors' | 'movements'

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const data = await contractorManagementService.listContractors(params);
      setContractors(data);
    } catch (err) {
      console.error('Failed to load contractors:', err);
      if (err.response?.status === 403) {
        setError('You do not have permission to view contractors.');
      } else {
        setError('Failed to load contractors.');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

  if (error) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <AlertTriangle size={32} color="#991b1b" style={{ marginBottom: 8 }} />
          <p style={{ color: '#991b1b', fontWeight: 500 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#1f2937' }}>Contractor Management</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>Manage contractor relationships, assignments, and biosecurity compliance</p>
        </div>
        <button onClick={fetchContractors}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <SummaryCard icon={<Users size={20} />} label="Total Contractors" value={contractors.length} color="#446145" />
        <SummaryCard icon={<CheckCircle size={20} />} label="Active" value={contractors.filter(c => c.relationship?.status === 'active').length} color="#166534" />
        <SummaryCard icon={<Clock size={20} />} label="Pending" value={contractors.filter(c => c.relationship?.status === 'pending').length} color="#92400e" />
        <SummaryCard icon={<Shield size={20} />} label="Verified" value={contractors.filter(c => c.is_verified).length} color="#1e40af" />
      </div>

      {/* Page-level tabs */}
      {!selectedContractor && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
          {[{ key: 'contractors', label: 'Contractors' }, { key: 'movements', label: 'Site Movements' }].map(t => (
            <button key={t.key} onClick={() => setPageTab(t.key)}
              style={{
                padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: pageTab === t.key ? 600 : 400,
                color: pageTab === t.key ? '#446145' : '#6b7280',
                borderBottom: pageTab === t.key ? '2px solid #446145' : '2px solid transparent',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {selectedContractor ? (
        <ContractorDetailView
          contractor={selectedContractor}
          onBack={() => setSelectedContractor(null)}
          onRefresh={fetchContractors}
        />
      ) : pageTab === 'contractors' ? (
        <ContractorListTab
          contractors={contractors}
          loading={loading}
          onSelect={setSelectedContractor}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      ) : (
        <MovementsListTab />
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ color, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
    </div>
  );
}
