// help/helpContent.jsx — central registry for the contextual (?) help popovers.
//
// Each entry is keyed by a stable topic id and holds { title, body }.
// Bodies are built with the <Help> helper below so every popover shares the
// same structure:
//   • intro   — one plain sentence: what this is / what it's for
//   • items   — 3–4 bullets under a "What you can do" label
//   • tip     — one or more short notes; pass a string, or an array of
//               strings for several (each renders as its own line)
//   • soon    — set true for unbuilt modules (shows a "Coming soon" badge and
//               flips the bullet label to "What it will show")
//
// HOLDING TEXT: the copy below is a first draft — revise freely. You only edit
// the strings; the formatting stays consistent. For anything bespoke you can
// also pass raw JSX as `body` instead of using <Help>.

function Help({ intro, label, items = [], tip, soon = false }) {
  const bulletLabel = label || (soon ? 'What it will show' : 'What you can do');
  // `tip` accepts a single string or an array of strings (one line each).
  const tips = Array.isArray(tip) ? tip.filter(Boolean) : tip ? [tip] : [];
  return (
    <>
      {soon && <p className="help-tip__soon">Coming soon</p>}
      <p>{intro}</p>
      {items.length > 0 && (
        <>
          <p className="help-tip__label">{bulletLabel}</p>
          <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}
      {tips.length > 0 && (
        <div className="help-tip__tips">
          {tips.map((t, i) => <p key={i} className="help-tip__tip">{t}</p>)}
        </div>
      )}
    </>
  );
}

export const HELP_CONTENT = {
  // ── Observation dashboard (ObservationDashboard.jsx) ──────────────────────
  'obs.tasks': {
    title: 'Tasks',
    body: (
      <Help
        intro="Tasks are the day-to-day jobs scheduled across your blocks or land management areas - spraying, mowing, pruning, tucking, and more."
        items={[
          'Filter by status, category, priority or who it’s assigned to',
          'Open a task to assign people and equipment and track progress',
          'Create a task from a template for consistent setup',
          'Spot overdue or unassigned work at a glance',
          'Complete tasks by row, or by block',
        ]}
        tip={[
          'Build a Task Template to pre-fill equipment, consumables and GPS settings.',
          'Add rows to your blocks under: Manage → Blocks to allow task tracking by row.',
        ]}
      />
    ),
  },
  'obs.taskTemplates': {
    title: 'Task Templates',
    body: (
      <Help
        intro="Reusable templates for common jobs, so every task starts with the right description, equipment, consumables, and settings."
        items={[
          'Create or edit a template',
          'Set default priority, duration and GPS requirement',
          'Attach required and optional equipment plus consumable rates',
          'Enable a template for field quick-create',
        ]}
        tip="Spray templates have specific requirements to allow spray effiiency maps."
      />
    ),
  },
  'obs.templates': {
    title: 'Observation Templates',
    body: (
      <Help
        intro="Define what is recorded during an observation run - the fields, measurements, GPS, and images captured in the field."
        items={[
          'Standardised templates provided + ad-hoc observations',
          'Quick use of templates in the field',
          'Schedule recurring observations',
        ]}
        tip="Observation templates are standardised to drive Insights, and to allow for cross season comparison."
      />
    ),
  },
  'obs.runs': {
    title: 'Observation Management',
    body: (
      <Help
        intro="Scheduled and completed observation runs - monitoring disease, phenology, bud counts, and other in-field records."
        items={[
          'Schedule a new observation run',
          'See active and past runs',
          'Review captured data by block',
          'Resume or swap between concurrent runs on the same block',
        ]}
        tip="Completed runs feed the Insights phenology and disease views."
      />
    ),
  },

  // ── Create / edit task template (TaskTemplateEditor.jsx) ──────────────────
  'taskTemplate.general': {
    title: 'Building a Task Template',
    body: (
      <Help
        intro="Set a job up once and create consistent tasks from it any time."
        items={[
          'Name and categorise the template',
          'For Category: Vineyard - task can be assigned to blocks',
          'For Category: Land Management - task can be assigned to management areas: paddocks etc',
          'Choose options like GPS tracking, partial completion and quick-create',
          'Add the equipment and consumables the job needs',
        ]}
        tip="Enable “quick create” to make this template available to crews in the field."
      />
    ),
  },
  'taskTemplate.basic': {
    title: 'Basic Information',
    body: (
      <Help
        intro="Name the template and set how it’s classified."
        items={[
          'Give it a clear name (e.g. Winter Pruning)',
          'Pick a category: Vineyard, Land Management, Compliance or General',
          'Add a subcategory and description for context',
        ]}
        tip="Category controls what a task from this template can be assigned to — Vineyard → blocks, Land Management → management areas."
      />
    ),
  },
  'taskTemplate.settings': {
    title: 'Default Settings',
    body: (
      <Help
        intro="Starting values applied to every task created from this template."
        items={[
          'Set a default priority',
          'Set an estimated duration in hours',
        ]}
        tip="These are defaults only - they can still be changed on an individual task."
      />
    ),
  },
  'taskTemplate.options': {
    title: 'Options',
    body: (
      <Help
        intro="Toggles that change how tasks from this template behave."
        items={[
          'Quick create - make it available to crews in the field',
          'Require GPS tracking - GPS record the track while the task runs: used for tractor or vehicle based tasks',
          'Allow partial completion - finish tasks by row or in stages',
          'Template is active - show it when creating tasks',
        ]}
        tip="GPS tracking must be on for spray coverage maps to be generated."
      />
    ),
  },
  'taskTemplate.equipment': {
    title: 'Equipment',
    body: (
      <Help
        intro="The machinery and tools a task needs. Required equipment must be present; optional equipment is offered but not enforced."
        items={[
          'Add required equipment the job can’t run without',
          'Add optional equipment crews can choose',
          'Only active assets appear in the list',
        ]}
        tip={[
          'For spray jobs, attach the sprayer here - its calibration settings drives spray efficiency maps.',
          'Set calibration settings for the asset under Assets → Equipment.',
        ]}
      />
    ),
  },
  'taskTemplate.consumables': {
    title: 'Consumables',
    body: (
      <Help
        intro="The products a task uses, each with a prescribed rate per hectare."
        items={[
          'Add each product and set its rate per hectare',
          'Choose the unit (L, kg, mL, g, units)',
          'Rates feed usage and stock reporting',
        ]}
        tip={[
          'For spray jobs, per-hectare rates + a calibrated sprayer flow + GPS = efficiency maps.',
          'Calibrate sprayer flow under Assets → Calibrations.',
        ]}
      />
    ),
  },

  // ── Assets dashboard (AssetsDashboard.jsx) ────────────────────────────────
  'assets.equipment': {
    title: 'Equipment',
    body: (
      <Help
        intro="Your physical assets - tractors, sprayers, mowers, tools, and infrastructure."
        items={[
          'Register equipment with make, model and category',
          'Search and filter by status',
          'Assigna nd set asset or infrastructure locations',
          'Open an asset to manage its maintenance and calibration',
          'Retire assets no longer in use',
        ]}
        tip={[
          'Infrastructure can be mapped as a point, line, or area representing different infrastructure types.',
          'Calibrate sprayer flow under Assets → Calibrations.',
        ]}
      />
    ),
  },
  'assets.consumables': {
    title: 'Consumables',
    body: (
      <Help
        intro="Stock items you use up - sprays, fertiliser, fuel and other inputs."
        items={[
          'Register a consumable with its unit and minimum stock',
          'Track current stock and low-stock alerts',
          'Record certifications (Organic, SWNZ, Biodynamic…)',
          'Quick-adjust stock levels',
        ]}
        tip="Items below their minimum flag automatically so you can reorder in time."
      />
    ),
  },
  'assets.maintenance': {
    title: 'Maintenance',
    body: (
      <Help
        intro="Scheduled and reactive servicing for your equipment, with due dates and priorities."
        items={[
          'Schedule maintenance with a due date and type',
          'See what’s due or overdue at a glance',
          'Filter by status and type',
          'Open the asset to log completion',
        ]}
        tip="Overdue items are highlighted so nothing slips through."
      />
    ),
  },
  'assets.calibrations': {
    title: 'Calibrations',
    body: (
      <Help
        intro="Calibration records that keep your equipment accurate and compliant."
        items={[
          'See overdue and upcoming calibrations',
          'Complete a pending calibration with readings and photos',
          'Review pass / fail history',
          'Filter by calibration type',
        ]}
        tip="Sprayer flow calibration feeds spray coverage and usage accuracy."
      />
    ),
  },

  // ── Calendar (Calendar.jsx) ───────────────────────────────────────────────
  'calendar.overview': {
    title: 'Calendar',
    body: (
      <Help
        intro="A unified view of tasks, observations, risk actions and maintenance across your operation."
        items={[
          'Switch between month and week views',
          'Filter by Property',
          'Click an event to open it',
          'Use Today and the arrows to move through dates',
        ]}
        tip="Event colours match the type — tasks, observations, risk actions and maintenance."
      />
    ),
  },

  // ── Risks dashboard (RiskDashboard.jsx) ───────────────────────────────────
  'risk.risks': {
    title: 'Risks',
    body: (
      <Help
        intro="Your risk register - hazards and risks identified across the operation, with inherent and residual ratings."
        items={[
          'Create a risk with its category and type',
          'See inherent vs residual risk levels',
          'Filter by level or type',
          'Open a risk to manage its controls',
        ]}
        tip={[
          'Risks within a Block or Property are surfaced to users and contractors undertaking a Task in that Block.',
          'Add actions and controls to bring residual risk down.',
        ]}
      />
    ),
  },
  'risk.actions': {
    title: 'Actions',
    body: (
      <Help
        intro="The controls and corrective actions that reduce your risks, each with an owner and due date."
        items={[
          'Track progress through to completion',
          'Filter to just your own actions',
          'Spot overdue actions quickly',
          'Edit details or reassign',
        ]}
        tip="Actions also appear on the Calendar so due dates stay visible."
      />
    ),
  },
  'risk.incidents': {
    title: 'Incidents',
    body: (
      <Help
        intro="The incident register - injuries, near misses, damage and environmental events, with WorkSafe notifiability assessed."
        items={[
          'Log an incident with its type and severity',
          'See which events are notifiable',
          'Filter by status, type or severity',
          'Investigate and close out',
        ]}
        tip="The notifiable flag follows the WorkSafe WKS-5 guide - check it for serious events."
      />
    ),
  },

  // ── Insights (Insights.jsx) ───────────────────────────────────────────────
  // NB: keys after the `insights.` prefix match the pill `key` values in
  // Insights.jsx (INSIGHT_CARDS) exactly (lowercase, no camelCase).
  'insights.climate': {
    title: 'Climate History',
    body: (
      <Help
        intro="Long-run climate for your Property and Region - growing degree days, rainfall, frost, and temperature trends from historical data."
        items={[
          'Explore the record season by season',
          'Compare your Property against Regional averages.',
          'See key metrics like GDD and rainfall totals',
        ]}
        tip="Assign a climate zone to a property (Manage → Weather) for the most relevant view."
      />
    ),
  },
  'insights.climateprojection': {
    title: 'Climate Projections',
    soon: true,
    body: (
      <Help
        soon
        intro="Future-climate scenarios for your Property and Region, drawing on climate-change model projections."
        items={[
          'Projected GDD, rainfall and temperature shifts',
          'Scenarios compared against your baseline',
          'Outlooks for Property and Region',
        ]}
      />
    ),
  },
  'insights.currentseason': {
    title: 'Current Season',
    soon: true,
    body: (
      <Help
        soon
        intro="How the current season is tracking against your baseline - degree-day accumulation, weather, and seasonal stats."
        items={[
          'GDD accumulation vs the long-run average',
          'Weather-station and modelled data for the property',
          'Outlooks for both your Property and Region',
        ]}
        tip="Select a property above to preview property-level intelligence."
      />
    ),
  },
  'insights.phenology': {
    title: 'Phenology',
    soon: true,
    body: (
      <Help
        intro="Vine growth-stage tracking that compares modelled phenology against your own field observations."
        items={[
          'See predicted stages across the season',
          'Compare model sources side by side',
          'Overlay your recorded bud, flower, and veraison observations',
        ]}
        tip="The more observations you capture, the sharper the comparison."
      />
    ),
  },
  'insights.sprayprogram': {
    title: 'Spray Program',
    body: (
      <Help
        intro="Spray coverage and program insight built from completed spray tasks - per-block application rates derived from GPS, swath width, and calibrated flow."
        items={[
          'View coverage heatmaps per block',
          'Review each application event',
          'Check rates against target and recompute coverage',
        ]}
        tip="Coverage needs a sprayer swath width, a flow calibration, and a GPS-tracked task."
      />
    ),
  },
  'insights.disease': {
    title: 'Disease',
    soon: true,
    body: (
      <Help
        soon
        intro="Disease-risk analysis from weather conditions, historical patterns, and field observations."
        items={[
          'Powdery mildew, downy mildew and botrytis risk',
          'Risk driven by recent and forecast weather',
          'Block-level pressure over the season',
        ]}
        tip="The more disease observations you capture, the sharper the insights."
      />
    ),
  },
  'insights.biosecurity': {
    title: 'Biosecurity',
    soon: true,
    body: (
      <Help
        soon
        intro="Pest-pressure monitoring and integrated pest management for your blocks."
        items={[
          'Pest pressure tracking',
          'Beneficial-insect monitoring',
          'IPM recommendations',
          'Contractor movements and tracking in outbreak or containment events',
        ]}
      />
    ),
  },
  'insights.blockchain': {
    title: 'BlockChain',
    soon: true,
    body: (
      <Help
        soon
        intro="A tamper-evident audit trail for your vineyard blocks."
        items={[
          'Immutable record of block activity',
          'Provenance from vineyard to product',
          'Verifiable history for compliance and buyers',
        ]}
      />
    ),
  },
  'insights.industry': {
    title: 'Latest Industry Insight',
    body: (
      <Help
        intro="Curated articles and updates from Auxein and the wider wine-growing industry."
        items={[
          'Browse the latest articles',
          'Stay across seasonal and regional news',
          'Open an article to read in full',
        ]}
      />
    ),
  },

  // ── Manage / Company Admin (CompanyAdmin.jsx) ─────────────────────────────
  'manage.users': {
    title: 'Team',
    body: (
      <Help
        intro="Manage the people in your company - their roles, access and details."
        items={[
          'Invite or edit team members',
          'Set roles (Company Admin, Manager, User)',
          'Deactivate accounts that are no longer needed',
        ]}
        tip={[
          'A user’s role and property access together control what they can see and do.',
          'Role type: "User" can only access the Mobile App, Managers and Admin have access to this Web App.',
        ]}
      />
    ),
  },
  'manage.invite': {
    title: 'Invite',
    body: (
      <Help
        intro="Send an invitation for someone to join your company in Auxein Grow."
        items={[
          'Enter their email, name and role',
          'Add an optional personal message',
          'Track sent invitations and their status',
        ]}
        tip={[
          'Invitations expire if unused - resend from the list if one lapses.',
          'Invitation emails contain the link to download the App from App Store and Google Play.',
        ]}
      />
    ),
  },
  'manage.properties': {
    title: 'Properties',
    body: (
      <Help
        intro="The properties is an important unit for management. Ensure you have at least one Property set."
        items={[
          'Create and edit properties',
          'Assign which users can see each property',
          'Set climate region and other property details',
          'Map a property in Maps page - allowing future atto sign on for contractors',
        ]}
        tip="Property access drives what users see across tasks, blocks, and observations."
      />
    ),
  },
  'manage.blocks': {
    title: 'Blocks',
    body: (
      <Help
        intro="Vineyard blocks are the base unit for all tasks, observations, and reporting."
        items={[
          'Edit blocks',
          'Set lifecycle status (developing, producing, mothballed…)',
          'Record variety, area and rows',
          'Keep blocks organised by property',
        ]}
        tip={[
          'Block status lets you filter active producing blocks from those out of production.',
          'Add rows to your Blocks to allow for row-by-row management or tasks.',
        ]}
      />
    ),
  },
  'manage.relationships': {
    title: 'Relationships',
    body: (
      <Help
        intro="Contractor relationships and property-management links between companies."
        items={[
          'Add a contractor so they’re assignable to tasks',
          'Transfer or grant property management',
          'View the history of changes',
        ]}
        tip="A contractor must have a relationship here before they can be assigned work."
      />
    ),
  },
  'manage.timesheets': {
    title: 'Timesheets',
    body: (
      <Help
        intro="A company-wide view of your team’s timesheet entries."
        items={[
          'Review entries across the team',
          'Check hours by person and period',
          'Spot gaps or anomalies',
        ]}
        tip="Deeper timesheet analysis is coming soon."
      />
    ),
  },
  'manage.training': {
    title: 'Training',
    soon: true,
    body: (
      <Help
        soon
        intro="Training modules and records for your team."
        items={[
          'Assign modules to team members',
          'Track completion and competency',
          'Keep an auditable training record',
        ]}
      />
    ),
  },
  'manage.aliases': {
    title: 'Aliases',
    body: (
      <Help
        intro="Map your blocks and other entities to the IDs used by external systems (e.g. Harvest, GrapeLink)."
        items={[
          'Link an entity to an external system ID',
          'Add an optional label for clarity',
          'Keep integrations matched to the right records',
        ]}
        tip="Accurate aliases keep imported data attached to the correct block."
      />
    ),
  },
  'manage.grapelink': {
    title: 'GrapeLink',
    soon: true,
    body: (
      <Help
        intro="Connect Auxein Grow to GrapeLink to exchange vineyard and block data."
        items={[
          'Set up the GrapeLink connection',
          'Map your blocks to GrapeLink records',
          'Keep data in sync between systems',
        ]}
        tip="Pair this with Aliases so records line up on both sides."
      />
    ),
  },
  'manage.weather': {
    title: 'Weather',
    body: (
      <Help
        intro="Weather and climate settings - assign climate zones and link weather and Harvest stations to your properties."
        items={[
          'Set a property’s climate zone',
          'Link Harvest weather stations',
          'Choose the forecast point for a property',
        ]}
        tip="A climate zone unlocks regional fallback data in Insights when no stations are linked."
      />
    ),
  },
  'manage.calendar': {
    title: 'Calendar Sync',
    soon: true,
    body: (
      <Help
        soon
        intro="Subscribe to your Auxein Grow calendar from Google, Outlook or Apple Calendar."
        items={[
          'A live ICS feed of your tasks and actions',
          'One-way sync into your own calendar app',
          'Always up to date as work changes',
        ]}
      />
    ),
  },
  'manage.subscriptions': {
    title: 'Subscriptions',
    soon: true,
    body: (
      <Help
        soon
        intro="Manage your Auxein Grow plan and billing."
        items={[
          'View your current plan',
          'See commitment term and billing cadence',
          'Manage invoices and payment details',
        ]}
      />
    ),
  },
  'manage.compliance': {
    title: 'Plans / Compliance',
    soon: true,
    body: (
      <Help
        soon
        intro="Compliance programs and plans for your operation."
        items={[
          'SWNZ, BioGro, Organics and Biodynamic programs',
          'Create and maintain vineyard / farm management plans',
          'Create and maintain vineyard / farm management maps',
          'Track requirements and evidence',
          'Stay audit-ready across schemes',
        ]}
      />
    ),
  },
  'manage.reports': {
    title: 'Reports',
    body: (
      <Help
        intro="Operational reports across tasks, observations, contractors, timesheets and assets."
        items={[
          'Switch between report types',
          'Filter by property',
          'Export to CSV for your records',
        ]}
        tip="Use the property filter to scope a report to a single site."
      />
    ),
  },
};

// Returns the { title, body } entry for a topic, or null if unknown.
export function getHelp(topic) {
  return HELP_CONTENT[topic] || null;
}
