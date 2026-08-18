// components/reports/VineyardCensusReport.jsx — the planting record.
//
// Not date-filtered: a census states what is in the ground now. Removed blocks
// are excluded by default because counting pulled-out blocks overstates planted
// area, which is the one number this report has to get right.
import { useState, useEffect, useCallback } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, ReportTable, Pill, ReportNote,
  LoadingBlock, ErrorBlock, fmtDate, fmtNum,
} from './ReportPrimitives';

function AreaTable({ title, rows, totalArea }) {
  return (
    <ReportTable
      title={title}
      maxHeight={300}
      columns={[
        { key: 'key', label: title.replace('By ', '') },
        { key: 'blocks', label: 'Blocks', align: 'right' },
        { key: 'area_hectares', label: 'Area (ha)', align: 'right', render: (r) => fmtNum(r.area_hectares, 2), text: (r) => fmtNum(r.area_hectares, 2) },
        {
          key: 'share',
          label: 'Share',
          align: 'right',
          render: (r) => (totalArea ? `${((r.area_hectares / totalArea) * 100).toFixed(1)}%` : '—'),
        },
      ]}
      rows={rows}
    />
  );
}

export default function VineyardCensusReport({ propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [includeRemoved, setIncludeRemoved] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getVineyardCensus(propertyId, includeRemoved)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [propertyId, includeRemoved]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="vineyard census" />;
  if (failed || !data) return <ErrorBlock label="vineyard census" onRetry={load} />;

  const columns = [
    { key: 'block_name', label: 'Block' },
    { key: 'property_name', label: 'Property' },
    { key: 'status', label: 'Status' },
    { key: 'variety', label: 'Variety' },
    { key: 'clone', label: 'Clone' },
    { key: 'rootstock', label: 'Rootstock' },
    { key: 'area_hectares', label: 'Area (ha)', align: 'right', render: (r) => fmtNum(r.area_hectares, 2), text: (r) => fmtNum(r.area_hectares, 2) },
    { key: 'planted_date', label: 'Planted', render: (r) => fmtDate(r.planted_date), text: (r) => fmtDate(r.planted_date) },
    { key: 'age_years', label: 'Age', align: 'right', render: (r) => (r.age_years == null ? '—' : `${r.age_years} y`), text: (r) => (r.age_years == null ? '' : `${r.age_years} y`) },
    { key: 'row_count', label: 'Rows', align: 'right' },
    {
      key: 'vines_estimated',
      label: 'Vines (est.)',
      align: 'right',
      render: (r) => (r.vines_estimated == null ? '—' : r.vines_estimated.toLocaleString('en-NZ')),
      text: (r) => (r.vines_estimated == null ? '' : r.vines_estimated.toLocaleString('en-NZ')),
    },
    { key: 'training_system', label: 'Training' },
    {
      key: 'certifications',
      label: 'Certification',
      render: (r) => (r.certifications.length
        ? r.certifications.map((c) => <Pill key={c} tone="success">{c}</Pill>)
        : '—'),
      text: (r) => r.certifications.join(', '),
    },
  ];

  const areaColumns = (heading) => [
    { key: 'key', label: heading },
    { key: 'blocks', label: 'Blocks', align: 'right' },
    { key: 'area_hectares', label: 'Area (ha)', align: 'right', text: (r) => fmtNum(r.area_hectares, 2) },
    {
      key: 'share',
      label: 'Share',
      align: 'right',
      text: (r) => (data.total_area_hectares
        ? `${((r.area_hectares / data.total_area_hectares) * 100).toFixed(1)}%`
        : ''),
    },
  ];

  const pdf = () => buildReportPdf({
    title: 'Vineyard census',
    company: companyName,
    context: contextLines({
      propertyName,
      extra: includeRemoved ? 'Includes removed blocks' : 'Planted blocks only',
    }),
    stats: [
      { label: 'Blocks', value: data.total_blocks },
      { label: 'Planted area (ha)', value: fmtNum(data.total_area_hectares, 2) },
      { label: 'Producing (ha)', value: fmtNum(data.producing_area_hectares, 2) },
      { label: 'Varieties', value: data.by_variety.length },
    ],
    sections: [
      { title: 'By variety', columns: areaColumns('Variety'), rows: data.by_variety },
      { title: 'By age band', columns: areaColumns('Age band'), rows: data.by_age_band },
      { title: 'By certification', columns: areaColumns('Certification'), rows: data.by_certification },
      {
        title: 'Blocks',
        columns,
        rows: data.blocks,
        note: (data.blocks_missing_area || data.blocks_missing_planted_date)
          ? `${data.blocks_missing_area} block(s) have no area recorded and are excluded from every hectare figure; ${data.blocks_missing_planted_date} have no planted date.`
          : undefined,
      },
    ],
    filename: 'vineyard-census.pdf',
  });

  return (
    <ReportSection
      title="Vineyard census"
      actions={(
        <>
          <label className="v2-form-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={includeRemoved}
              onChange={(e) => setIncludeRemoved(e.target.checked)}
            />
            Include removed
          </label>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportVineyardCensus(propertyId, includeRemoved)} />
        </>
      )}
    >
      <StatGrid>
        <Stat value={data.total_blocks} label="Blocks" />
        <Stat value={fmtNum(data.total_area_hectares, 2)} label="Planted area" suffix=" ha" />
        <Stat value={fmtNum(data.producing_area_hectares, 2)} label="Producing" suffix=" ha" />
        <Stat value={data.by_variety.length} label="Varieties" />
      </StatGrid>

      {(data.blocks_missing_area > 0 || data.blocks_missing_planted_date > 0) && (
        <ReportNote>
          Data gaps worth closing before this goes to a winery or an auditor:{' '}
          {data.blocks_missing_area > 0 && (
            <><strong>{data.blocks_missing_area}</strong> block
            {data.blocks_missing_area === 1 ? '' : 's'} with no area recorded (excluded from every
            hectare figure above){data.blocks_missing_planted_date > 0 ? ', ' : '. '}</>
          )}
          {data.blocks_missing_planted_date > 0 && (
            <><strong>{data.blocks_missing_planted_date}</strong> with no planted date, so they fall
            into the Unknown age band.</>
          )}
        </ReportNote>
      )}

      <AreaTable title="By variety" rows={data.by_variety} totalArea={data.total_area_hectares} />
      <AreaTable title="By age band" rows={data.by_age_band} totalArea={data.total_area_hectares} />
      <AreaTable title="By certification" rows={data.by_certification} totalArea={data.total_area_hectares} />
      <AreaTable title="By status" rows={data.by_status} totalArea={data.total_area_hectares} />

      <ReportTable
        title="Blocks"
        columns={columns}
        rows={data.blocks}
        empty="No blocks recorded"
        maxHeight={560}
      />
    </ReportSection>
  );
}
