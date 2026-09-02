// components/csv/growCsvSpecs.js — column definitions for the block and row
// spreadsheet round-trips.
//
// No database ids appear in either file.
//
//   Blocks are keyed on `block_name` and are UPDATE-ONLY. A CSV cannot draw a
//   boundary, and a block without geometry is absent from the map, unsplittable
//   and invisible to anything spatial — so a spreadsheet that could create them
//   would build a register of entries that look real in a list and nowhere else.
//   A block with no name cannot appear at all: it has nothing to match on. Those
//   are excluded from the export and counted, so the number is explainable.
//
//   Rows are keyed on `block` + `row_number` and DO create. A row needs no
//   geometry to be useful — no row in the database has any — so a spreadsheet
//   can bring a block's whole row set into existence, which is the point for a
//   property being onboarded.
//
// `property` and `block` are name columns resolved against the user's own
// visible sets, so naming someone else's is unexpressable rather than merely
// rejected.

export const BLOCK_STATUSES = [
  'developing', 'pre_production', 'producing', 'redeveloping',
  'replanting', 'mothballed', 'retired',
];

export const BLOCK_CSV_SPEC = {
  entity: 'block',
  entityLabel: 'block',
  title: 'Blocks',
  label: 'blocks',
  fileStem: 'blocks',
  // A CSV cannot supply geometry. See the header note.
  allowCreate: false,
  matchOn: ['block_name'],
  columns: [
    { key: 'block_name', header: 'block_name', type: 'string', required: true, aliases: ['block', 'name'] },
    {
      key: 'property', header: 'property', type: 'string',
      lookup: { source: 'properties', idKey: 'property_id', labelField: 'name' },
    },
    // clearable:false — status has a server default and no meaningful empty
    // state, so a blank cell leaves it as it was rather than nulling it.
    { key: 'status', header: 'status', type: 'lower', enum: BLOCK_STATUSES, clearable: false },
    { key: 'variety', header: 'variety', type: 'string' },
    { key: 'clone', header: 'clone', type: 'string' },
    { key: 'rootstock', header: 'rootstock', type: 'string' },
    { key: 'training_system', header: 'training_system', type: 'string' },
    { key: 'area', header: 'area_ha', type: 'number', aliases: ['area', 'hectares', 'ha'] },
    { key: 'planted_date', header: 'planted_date', type: 'date' },
    { key: 'removed_date', header: 'removed_date', type: 'date' },
    { key: 'row_spacing', header: 'row_spacing', type: 'number' },
    { key: 'vine_spacing', header: 'vine_spacing', type: 'number' },
    { key: 'row_start', header: 'row_start', type: 'string' },
    { key: 'row_end', header: 'row_end', type: 'string' },
    { key: 'region', header: 'region', type: 'string' },
    { key: 'gi', header: 'gi', type: 'string' },
    { key: 'winery', header: 'winery', type: 'string' },
    { key: 'elevation', header: 'elevation', type: 'number' },
    { key: 'swnz', header: 'swnz', type: 'bool' },
    { key: 'organic', header: 'organic', type: 'bool' },
    { key: 'biodynamic', header: 'biodynamic', type: 'bool' },
    { key: 'regenerative', header: 'regenerative', type: 'bool' },
    { key: 'notes', header: 'notes', type: 'string' },
    // Read-only: this is the ACTUAL number of vineyard_row records, not the
    // stored column, so writing it back would be meaningless. Exported because
    // "how many rows does this block have" is worth seeing in a register.
    { key: 'row_count', header: 'row_count', type: 'int', readOnly: true },
  ],
  sampleRows: [
    'Block 13 Pinot Noir,Home Block,producing,Pinot Noir,777,3309,VSP,1.18,2011-08-01,,2.2,1.4,1,42,North Canterbury,Waipara,,120,true,false,false,false,Frost-prone corner,',
  ],
};

export const ROW_CSV_SPEC = {
  entity: 'row',
  entityLabel: 'row',
  title: 'Vineyard rows',
  label: 'rows',
  fileStem: 'rows',
  allowCreate: true,
  matchOn: ['block', 'row_number'],
  columns: [
    {
      key: 'block', header: 'block', type: 'string', required: true,
      aliases: ['block_name'],
      lookup: { source: 'blocks', idKey: 'block_id', labelField: 'block_name' },
    },
    { key: 'row_number', header: 'row_number', type: 'string', required: true, aliases: ['row'] },
    { key: 'row_length', header: 'row_length', type: 'number' },
    { key: 'vine_spacing', header: 'vine_spacing', type: 'number' },
    { key: 'variety', header: 'variety', type: 'string' },
    { key: 'clone', header: 'clone', type: 'string' },
    { key: 'rootstock', header: 'rootstock', type: 'string' },
    // Derived on the server from row_length / vine_spacing. Shown, never written.
    { key: 'vine_count', header: 'vine_count', type: 'int', readOnly: true },
  ],
  sampleRows: [
    'Block 13 Pinot Noir,1,148,1.4,Pinot Noir,777,3309,',
    'Block 13 Pinot Noir,2,148,1.4,Pinot Noir,777,3309,',
    'Block 13 Pinot Noir,3,152,1.4,Pinot Noir,115,3309,',
  ],
};
