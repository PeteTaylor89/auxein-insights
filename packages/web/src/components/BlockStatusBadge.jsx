import { getBlockStatusMeta, BLOCK_STATUS_VALUES } from '@vineyard/shared';
import PropTypes from 'prop-types';

const TONE_VARS = {
  muted:   { bg: 'var(--color-surface-warm)', fg: 'var(--color-text-muted)' },
  info:    { bg: 'var(--color-info-bg)',      fg: 'var(--color-info)'       },
  warning: { bg: 'var(--color-warning-bg)',   fg: 'var(--color-warning)'    },
  success: { bg: 'var(--color-success-bg)',   fg: 'var(--color-success)'    },
  danger:  { bg: 'var(--color-danger-bg)',    fg: 'var(--color-danger)'     },
};

const SIZE_STYLES = {
  sm: { padding: '2px 8px',  fontSize: 'var(--font-size-xs)' },
  md: { padding: '2px 10px', fontSize: 'var(--font-size-xs)' },
  lg: { padding: '4px 12px', fontSize: 'var(--font-size-sm)' },
};

export default function BlockStatusBadge({ status, size = 'md' }) {
  const meta = getBlockStatusMeta(status);
  const tone = TONE_VARS[meta.tone] || TONE_VARS.muted;
  const sizing = SIZE_STYLES[size] || SIZE_STYLES.md;
  return (
    <span style={{
      background: tone.bg,
      color: tone.fg,
      borderRadius: 'var(--radius-pill)',
      fontWeight: 600,
      display: 'inline-block',
      whiteSpace: 'nowrap',
      ...sizing,
    }}>
      {meta.label}
    </span>
  );
}

BlockStatusBadge.propTypes = {
  status: PropTypes.oneOf([...BLOCK_STATUS_VALUES, '', null, undefined]),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
};
