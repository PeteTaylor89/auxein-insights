import {
  Map,
  CheckSquare,
  Eye,
  CloudSun,
  ClipboardCheck,
  HardHat,
  Users,
  Wrench,
  Bell,
  type LucideIcon,
} from 'lucide-react';

export interface GrowFeature {
  name: string;
  description: string;
}

export interface GrowFeatureGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  features: GrowFeature[];
}

export const growFeatureGroups: GrowFeatureGroup[] = [
  {
    id: 'mapping',
    label: 'Mapping & Property',
    icon: Map,
    features: [
      {
        name: 'Property Management',
        description:
          'Organise your vineyard into named properties with owner, location, External IDs, and user defined settings.'
      },
      {
        name: 'Block Mapping',
        description:
          'Draw, name, and manage individual vineyard blocks with variety, clone, rootstock, row orientation, and area calculations on an interactive map.',
      },
      {
        name: 'Operational Areas',
        description:
          'Define areas within your property - orchards, infrastructure, buffer zones, laneways, ponds - for task assignment, biosecurity monitoring, and spatial reporting.',
      },
      {
        name: 'Map Layers',
        description:
          'Toggle curated data layers over your blocks: disease pressure, phenology stage, live weather station readings, spray efficiency heatmap, and risks.',
      },
      {
        name: 'Map Builder',
        description:
          'Save named map configurations, export your current map view as PNG or PDF, and import custom layers.',
      },
    ],
  },
  {
    id: 'tasks',
    label: 'Task Management',
    icon: CheckSquare,
    features: [
      {
        name: 'Task Engine',
        description:
          'Create, assign, and track vineyard tasks across blocks and operational areas, with a full status workflow from planning through to completion.',
      },
      {
        name: 'Task Templates',
        description:
          'Define repeatable task types - pruning, tucking, mowing, cultivation - with default assignees, durations, and instructions.',
      },
      {
        name: 'Spray Tasks',
        description:
          'Log spray applications with product, rate, block, operator, and GPS-tracked spray run coverage, assisted generation of spray diary records.',
      },
      {
        name: 'Cost Tracking',
        description:
          'Attach chemical costs, labour hours, and contractor fees to tasks for block-level seasonal cost visibility.',
      },
      {
        name: 'Calendar View',
        description:
          'See all tasks, observations, training deadlines, maintenance due dates, and weather alerts in a unified colour-coded calendar.',
      },
      {
        name: 'GPS Tractor Tracking',
        description:
          'Record GPS tracks for tractor-based tasks with progress logging.',
      },
    ],
  },
  {
    id: 'observations',
    label: 'Observations',
    icon: Eye,
    features: [
      {
        name: 'Observation Engine',
        description:
          'Log structured field observations across disease, phenology, vine health, pest, irrigation, weather event, and more - from web or mobile.',
      },
      {
        name: 'Observation Templates',
        description:
          'Use structured templates for each observation type to ensure consistent, comparable data across seasons.',
      },
      {
        name: 'Scheduled Observations',
        description:
          'Plan and assign regular monitoring rounds such as weekly disease scouting, with completion tracking.',
      },
      {
        name: 'Photo & GPS Capture',
        description:
          'Attach geotagged photos to observations directly from the field.',
      },
      {
        name: 'Escalation to Risk or Task',
        description:
          'Flag observations as requiring action to automatically escalate into a risk record or trigger a follow-up task.',
      },
    ],
  },
  {
    id: 'climate',
    label: 'Insights',
    icon: CloudSun,
    features: [
      {
        name: 'Property-Level Climate History',
        description:
          'View 1986-present climate data - GDD, rainfall, temperature, diurnal range - at block level drawn from Auxein\'s virtual climate network.',
      },
      {
        name: 'Projected Climate to 2100',
        description:
          'See CMIP6-based climate projections for your properties, along with climate related risks.',
      },
      {
        name: 'Downy Mildew Model',
        description:
          'Peer-reviewed infection risk model driven by on-site or local weather data with daily risk index - model links to observations and spray records.',
      },
      {
        name: 'Powdery Mildew Model',
        description:
          'Continuous powdery mildew risk index based on temperature and relative humidity with spray interval monitoring.',
      },
      {
        name: 'Botrytis Model',
        description:
          'Bunch rot risk model calibrated to flowering and bunch closure phenology stages with severity scoring.',
      },
      {
        name: 'Phenology Timeline',
        description:
          'Record and track EL-scale phenology observations per block, with modelled vs. observed comparisons and projected stage timing.',
      },
      {
        name: 'Harvest Estimation',
        description:
          'Track bud count, flower set, and bunch development to generate a rolling crop load and harvest timing estimate per block.',
      },
      {
        name: 'Live Weather Station Data',
        description:
          'Ingest data from Harvest Electronics stations assigned to your property for real-time temperature, humidity, rainfall, and leaf wetness.',
      },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance & Traceability',
    icon: ClipboardCheck,
    features: [
      {
        name: 'ACVM Chemical Database - coming soon',
        description:
          'Search and select registered chemical products from the NZ ACVM register when logging spray tasks, with withholding period tracking.',
      },
      {
        name: 'Audit Trail',
        description:
          'Full, timestamped record of all actions per block and property, verifiable for organics, SWNZ, audit, and export market traceability requests.',
      },
    ],
  },
  {
    id: 'health-safety',
    label: 'Health & Safety',
    icon: HardHat,
    features: [
      {
        name: 'Risk Register',
        description:
          'Maintain an ISO-standard risk register with hazard descriptions, likelihood and consequence ratings, and linked control actions.',
      },
      {
        name: 'Risk Controls',
        description:
          'Assign control measures to risks with responsible person, review date, and completion tracking.',
      },
      {
        name: 'Spatial Risk Management',
        description:
          'Link risk records to specific blocks or operational areas for location-aware safety management.',
      },
      {
        name: 'Incident Reporting',
        description:
          'Log workplace incidents with description, location, affected persons, and immediate actions taken.',
      },
      {
        name: 'Root Cause Analysis',
        description:
          'Complete structured root cause analysis and corrective action planning within each incident record.',
      },
      {
        name: 'Incident Escalation',
        description:
          'Escalate incidents to company admin with notification workflow and resolution tracking.',
      },
    ],
  },
  {
    id: 'people',
    label: 'People & Workforce',
    icon: Users,
    features: [
      {
        name: 'Contractor Management',
        description:
          'Onboard contractors via self-registration, manage relationships across multiple companies, and track biosecurity movement declarations on entry and exit.',
      },
      {
        name: 'Visitor Management',
        description:
          'Log and track vineyard visitors with H&S and biosecurity declarations.',
      },
      {
        name: 'Timesheets',
        description:
          'Staff log time against tasks; managers view, approve, and export timesheet data to CSV for payroll processing.',
      },
      {
        name: 'Training Modules',
        description:
          'Build mobile-first training modules with slides; assign to users by role and track completion.',
      },
      {
        name: 'Multi-Role Permissions',
        description:
          'Four user roles: Company Admin, Company Manager, Company User, and Contractor, with granular module-level permissions.',
      },
    ],
  },
  {
    id: 'assets',
    label: 'Assets & Equipment',
    icon: Wrench,
    features: [
      {
        name: 'Asset Register',
        description:
          'Maintain a register of equipment, vehicles, and infrastructure with full service history.',
      },
      {
        name: 'Consumables & Stock',
        description:
          'Track chemical and input stock levels with usage drawn down automatically against tasks.',
      },
      {
        name: 'Maintenance Schedules',
        description:
          'Set recurring maintenance tasks for equipment with due date alerts and completion records.',
      },
      {
        name: 'Calibration Records',
        description:
          'Log spray unit, sensor, and asset calibration events with certificates and next-due tracking.',
      },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts & Reporting',
    icon: Bell,
    features: [
      {
        name: 'Notification Dashboard',
        description:
          'View all system alerts - disease threshold, frost, task overdue, incident, training deadline - in a unified in-app notification centre.',
      },
      {
        name: 'Operational Reports',
        description:
          'Export season summaries, spray records, observation logs, timesheet data, and incident reports to CSV or PDF.',
      },
      {
        name: 'Biosecurity Monitoring',
        description:
          'Record weed, pest, and pathogen observations on blocks and operational areas with contractor movement records for traceability.',
      },
    ],
  },
];

export const growFeatureCount = growFeatureGroups.reduce(
  (total, group) => total + group.features.length,
  0
);