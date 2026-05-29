// pages/QuickObservation.jsx — 3-step quick observation: template → block → capture
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Eye, Search } from 'lucide-react';
import { observationService, authService, blocksService } from '@vineyard/shared';
import './QuickObservation.css';

// Template groupings per streamlining report §3.6
const TEMPLATE_GROUPS = [
  {
    key: 'quick',
    label: 'Quick Check',
    hint: 'Something you noticed in the field',
    types: ['other', 'disease', 'pest'],
    names: ['Free-form Observation', 'Pests & Diseases', 'Vine Health'],
  },
  {
    key: 'phenology',
    label: 'Phenology & Growth',
    hint: 'Seasonal monitoring',
    types: ['phenology', 'bud_count', 'growth'],
    names: ['Phenology', 'Bud Count', 'Growth', 'Canopy'],
  },
  {
    key: 'yield',
    label: 'Yield Estimation',
    hint: 'Crop estimation & counting',
    types: ['flower_count', 'pre_veraison_yield', 'post_veraison_yield'],
    names: ['Flower Count', 'Bunch Count', 'Yield Estimation'],
  },
  {
    key: 'lab',
    label: 'Lab & Sampling',
    hint: 'Lab analysis & sample collection',
    types: ['lab_sampling', 'maturity_sampling'],
    names: ['Lab Sampling', 'External Lab'],
  },
  {
    key: 'environment',
    label: 'Environment & Compliance',
    hint: 'Land, weather, biosecurity',
    types: ['land_management', 'weather', 'biosecurity', 'compliance', 'hazard'],
    names: ['Land Management', 'Frost Event', 'Beneficial Species', 'Biosecurity'],
  },
];

function groupTemplates(templates) {
  const grouped = TEMPLATE_GROUPS.map((g) => ({ ...g, templates: [] }));
  const customGroup = { key: 'custom', label: 'Custom', hint: 'Company templates', templates: [] };
  const used = new Set();

  for (const group of grouped) {
    for (const t of templates) {
      if (used.has(t.id)) continue;
      const typeName = t.type || t.observation_type || '';
      const nameMatch = group.names.some((n) => t.name?.toLowerCase().includes(n.toLowerCase()));
      const typeMatch = group.types.includes(typeName);
      if (nameMatch || typeMatch) {
        group.templates.push(t);
        used.add(t.id);
      }
    }
  }

  // Anything not grouped goes to custom
  for (const t of templates) {
    if (!used.has(t.id)) {
      customGroup.templates.push(t);
    }
  }

  const result = grouped.filter((g) => g.templates.length > 0);
  if (customGroup.templates.length > 0) result.push(customGroup);
  return result;
}

const STEPS = ['Pick Template', 'Pick Block', 'Starting...'];

export default function QuickObservation() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [step, setStep] = useState(0);

  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    observationService.getTemplates({ include_system: true })
      .then((data) => {
        let arr = [];
        if (Array.isArray(data)) arr = data;
        else if (Array.isArray(data?.items)) arr = data.items;
        else if (Array.isArray(data?.templates)) arr = data.templates;
        // Filter out anything that isn't a valid template object
        setTemplates(arr.filter((t) => t && typeof t === 'object' && t.id && t.name));
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));

    blocksService.getCompanyBlocks()
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.blocks || data?.items || [];
        setBlocks(arr);
      })
      .catch(() => setBlocks([]))
      .finally(() => setLoadingBlocks(false));
  }, []);

  const grouped = groupTemplates(templates);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setStep(1);
  };

  const handleBlockSelect = async (block) => {
    setSelectedBlock(block);
    setStep(2);
    setCreating(true);
    setError(null);

    try {
      const run = await observationService.createRun({
        company_id: companyId,
        template_id: selectedTemplate.id,
        block_id: block.id,
      });
      navigate(`/observations/runcapture/${run.id}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
        : 'Failed to start observation';
      setError(msg);
      setCreating(false);
      setStep(1);
    }
  };

  return (
    <div className="page-container">
      <div className="qo-page">
        {/* Header */}
        <div className="qo-header">
          <button className="btn-ghost" onClick={() => step > 0 && !creating ? setStep(step - 1) : navigate('/observations')}>
            <ArrowLeft size={18} />
            {step > 0 && !creating ? 'Back' : 'Vineyard'}
          </button>
          <div className="qo-title">
            <Eye size={20} />
            <h1 className="section-title">Quick Observation</h1>
          </div>
          <Link to="/observations/schedule" className="btn-ghost qo-plan-link">
            Schedule for later
          </Link>
        </div>

        {/* Step indicator */}
        <div className="qo-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`qo-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="qo-step-circle">
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className="qo-step-label">{label}</span>
            </div>
          ))}
        </div>

        {error && <div className="qo-error">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}

        {/* Step 0: Pick template (grouped) */}
        {step === 0 && (
          <div className="qo-content">
            <h2 className="qo-subtitle">What are you observing?</h2>
            {loadingTemplates ? (
              <div className="qo-loading">Loading templates...</div>
            ) : grouped.length === 0 ? (
              <div className="qo-empty">No observation templates available</div>
            ) : (
              <div className="qo-template-groups">
                {grouped.map((group) => (
                  <div key={group.key} className="qo-group">
                    <div className="qo-group-header">
                      <h3>{group.label}</h3>
                      <span className="qo-group-hint">{group.hint}</span>
                    </div>
                    <div className="qo-template-grid">
                      {group.templates.map((t) => (
                        <button
                          key={t.id}
                          className="qo-template-card"
                          onClick={() => handleTemplateSelect(t)}
                        >
                          <span className="qo-template-name">{t.name}</span>
                          {t.company_id && <span className="qo-template-badge">Custom</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Pick block */}
        {step === 1 && (
          <div className="qo-content">
            <h2 className="qo-subtitle">Which block?</h2>
            <p className="qo-hint">
              Template: <strong>{selectedTemplate?.name}</strong>
            </p>
            {loadingBlocks ? (
              <div className="qo-loading">Loading blocks...</div>
            ) : blocks.length === 0 ? (
              <div className="qo-empty">No vineyard blocks found</div>
            ) : (
              <div className="qo-block-grid">
                {blocks.map((b) => (
                  <button
                    key={b.id}
                    className="qo-block-card"
                    onClick={() => handleBlockSelect(b)}
                  >
                    <span className="qo-block-name">{b.block_name}</span>
                    {b.variety && <span className="qo-block-variety">{b.variety}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Creating */}
        {step === 2 && creating && (
          <div className="qo-content">
            <div className="qo-creating">
              Starting observation...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
