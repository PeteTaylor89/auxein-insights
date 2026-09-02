// components/csv/assetCsvSpecs.js — column definitions for the asset register
// spreadsheet round-trip.
//
// Equipment and consumables share one endpoint and one parser; they differ only
// in which columns are worth putting in front of the user. Equipment cares about
// make/model/serial, consumables about stock and cost. One combined file would
// hand everyone a dozen columns that are blank on half their rows.
//
// NO DATABASE IDS APPEAR IN THESE FILES. `asset_number` is the key — the user
// already owns it, it is already unique per company, and it means something when
// you read it. `property` shows the property NAME and resolves to an id on the
// way in, against the properties this user can actually see, so naming someone
// else's property is unexpressable rather than merely rejected.
//
// Deliberately NOT here: geometry, calibration specs, certifications and hazard
// classifications. They are structured or spatial, and validating them from a
// spreadsheet cell would cost more than the on-screen editor already gives.

export const ASSET_CATEGORIES = ['equipment', 'vehicle', 'tool', 'consumable', 'infrastructure'];
export const ASSET_TYPES = ['physical', 'consumable'];
export const ASSET_STATUSES = ['active', 'maintenance', 'retired', 'disposed', 'out_of_stock'];

const SHARED_HEAD = [
  // The match key. Editing it here adds an asset rather than renaming one —
  // the change preview shows that as an addition before anything is written.
  { key: 'asset_number', header: 'asset_number', type: 'string', required: true, aliases: ['asset no', 'number'] },
  { key: 'name', header: 'name', type: 'string', required: true },
  { key: 'category', header: 'category', type: 'lower', required: true, enum: ASSET_CATEGORIES },
  { key: 'asset_type', header: 'asset_type', type: 'lower', required: true, enum: ASSET_TYPES, aliases: ['type'] },
  { key: 'subcategory', header: 'subcategory', type: 'string' },
];

const SHARED_TAIL = [
  // clearable:false — status has a server default ("active") and no meaningful
  // empty state, so a blank cell leaves it as it was rather than nulling it.
  { key: 'status', header: 'status', type: 'lower', enum: ASSET_STATUSES, clearable: false },
  {
    key: 'property', header: 'property', type: 'string',
    lookup: { source: 'properties', idKey: 'property_id', labelField: 'name' },
  },
  { key: 'location_label', header: 'location_label', type: 'string', aliases: ['location'] },
  { key: 'description', header: 'description', type: 'string' },
];

export const EQUIPMENT_CSV_SPEC = {
  entity: 'equipment',
  entityLabel: 'asset',
  title: 'Equipment & vehicles',
  label: 'equipment',
  fileStem: 'equipment',
  allowCreate: true,
  matchOn: ['asset_number'],
  columns: [
    ...SHARED_HEAD,
    { key: 'make', header: 'make', type: 'string' },
    { key: 'model', header: 'model', type: 'string' },
    { key: 'serial_number', header: 'serial_number', type: 'string', aliases: ['serial'] },
    { key: 'year_manufactured', header: 'year_manufactured', type: 'int', aliases: ['year'] },
    ...SHARED_TAIL,
  ],
  sampleRows: [
    'TR-001,Kubota M7060,equipment,physical,tractor,Kubota,M7060,SN-KB-99213,2019,active,,Main shed,Primary row tractor',
    'SPR-001,Croplands Quantum Mist,equipment,physical,sprayer,Croplands,Quantum Mist 2000,SN-CL-77310,2020,active,,Implement bay,"Twin-fan, 2000L tank"',
  ],
};

export const CONSUMABLE_CSV_SPEC = {
  entity: 'consumable',
  entityLabel: 'consumable',
  title: 'Consumables',
  label: 'consumables',
  fileStem: 'consumables',
  allowCreate: true,
  matchOn: ['asset_number'],
  columns: [
    ...SHARED_HEAD,
    { key: 'unit_of_measure', header: 'unit_of_measure', type: 'string', aliases: ['unit'] },
    { key: 'current_stock', header: 'current_stock', type: 'number', aliases: ['stock'] },
    { key: 'minimum_stock', header: 'minimum_stock', type: 'number' },
    { key: 'cost_per_unit', header: 'cost_per_unit', type: 'number', aliases: ['cost'] },
    ...SHARED_TAIL,
  ],
  sampleRows: [
    'CHEM-001,Sulphur WG,consumable,consumable,fungicide,kg,240,50,4.85,active,,Chemical store,Wettable granule',
    'FUEL-001,Diesel,consumable,consumable,fuel,L,1800,500,2.15,active,,Fuel bay,Bulk tank',
  ],
};
