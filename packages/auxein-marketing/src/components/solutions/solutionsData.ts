import {
  BarChart3,
  Map,
  Database,
  CloudSun,
  Waves,
  Leaf,
  Calculator,
  TrendingUp,
} from 'lucide-react';

export interface Solution {
  id: string;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  icon: typeof BarChart3;
  cta: {
    label: string;
    href: string;
  };
  badge?: string;
  comingSoon?: boolean;
}

export const solutions: Solution[] = [
  {
    id: 'insights-pro',
    title: 'Auxein Insights Pro',
    tagline: 'Complete vineyard management platform',
    description:
      'A comprehensive SaaS platform combining climate intelligence, blockchain-powered traceability, and precision vineyard management. From tracking phenology, disease pressures, and yield estimates, to managing your entire operation, Insights Pro gives you the data-driven edge your vineyard needs.',
    features: [
      'Real-time climate monitoring and alerts',
      'Disease pressure modeling (downy mildew, powdery mildew, botrytis)',
      'Phenology, Health and Safety, and general observation tracking',
      'Spray diary automation with GPS tracking and automated compliance filing',
      'Harvest planning and yield forecasting',
      'Blockchain-verified traceability',
      'Mobile-first design for field use',
    ],
    icon: BarChart3,
    cta: {
      label: 'Join the Waitlist',
      href: '/insights-pro',
    },
    badge: 'Coming May 2026',
    comingSoon: true,
  },
  {
    id: 'regional-insights',
    title: 'Regional Intelligence',
    tagline: 'Free climate insights for NZ wine regions',
    description:
      'Explore current and historical climate data across New Zealand wine regions. Our regional intelligence platform provides accessible climate analysis to help the industry understand and adapt to changing conditions.',
    features: [
      'Interactive regional wine maps',
      'Real time current season tracking',
      'Phenological tracking',
      'Disease risk assessment',
      'Historical trend analysis',
      'Regional comparison tools',
      'Climate projections analysis',
    ],
    icon: Map,
    cta: {
      label: 'Explore Now',
      href: 'https://insights.auxein.co.nz',
    },
  },
  {
    id: 'vineyard-dataset',
    title: 'NZ Vineyard Geodatabase',
    tagline: 'Complete vineyard boundary dataset',
    description:
      'A comprehensive geodatabase of New Zealand vineyard boundaries, varietals, and management practices. Ideal for research institutions, industry bodies, and agricultural technology companies.',
    features: [
      'National coverage of vineyard boundaries',
      'Varietal and rootstock information where available',
      'Regular updates and validation',
      'GeoJSON, Shapefile, and PostGIS formats',
      'API access available',
      'Custom licensing arrangements',
    ],
    icon: Database,
    cta: {
      label: 'Enquire About Licensing',
      href: '/contact?inquiry=vineyard-data',
    },
  },
  {
    id: 'climate-dataset',
    title: 'Climate Dataset',
    tagline: 'Historical and projected climate data',
    description:
      'High-resolution vineyard-specific climate data including historical observations and future projections. Built on peer-reviewed methodology from published research on climate impacts on wine quality.',
    features: [
      'Vineyard-scale spatial resolution',
      'Daily temperature, precipitation, humidity',
      'Growing degree day calculations',
      'Climate projections to 2100',
      'Multiple emission scenarios (RCP/SSP)',
    ],
    icon: CloudSun,
    cta: {
      label: 'Enquire About Licensing and Specification',
      href: '/contact?inquiry=climate-data',
    },
  },
  {
    id: 'coastal-risk',
    title: 'Coastal Inundation Risk',
    tagline: 'Sea level rise impact assessment',
    description:
      'Projected coastal inundation risk data for vineyard and agricultural assets. Understand long-term climate risks to your operations and make informed decisions about infrastructure investments.',
    features: [
      'Multiple sea level rise scenarios',
      'Storm surge modeling',
      'Asset-level risk assessment',
      'Interactive visualization tools',
      'Integration with property data',
      'Custom reporting available',
    ],
    icon: Waves,
    cta: {
      label: 'Enquire About Licensing',
      href: '/contact?inquiry=coastal-risk',
    },
  },
  {
    id: 'swnz-consulting',
    title: 'SWNZ Consulting',
    tagline: 'Sustainable Winegrowing NZ certification support',
    description:
      'Expert guidance to achieve and maintain Sustainable Winegrowing New Zealand certification. We help you navigate the requirements, implement best practices, and document your sustainability journey.',
    features: [
      'Gap analysis and action planning',
      'Documentation and evidence preparation',
      'Staff training and capability building',
      'Audit preparation support',
      'Ongoing compliance assistance',
      'Integration with Insights platform',
    ],
    icon: Leaf,
    cta: {
      label: 'Get in Touch',
      href: '/contact?inquiry=swnz',
    },
  },
  {
    id: 'carbon-accounting',
    title: 'Carbon Accounting',
    tagline: 'Measure and manage your carbon footprint',
    description:
      'Comprehensive carbon accounting services tailored for vineyards and wineries. Understand your emissions profile, identify reduction opportunities, and prepare for evolving reporting requirements.',
    features: [
      'Scope 1, 2, and 3 emissions calculation',
      'Vineyard carbon sequestration assessment',
      'Reduction pathway development',
      'Offset strategy and procurement',
      'Annual reporting and tracking',
      'Science-based target setting',
    ],
    icon: Calculator,
    cta: {
      label: 'Get in Touch',
      href: '/contact?inquiry=carbon',
    },
  },
  {
    id: 'climate-risk',
    title: 'Climate Risk Consulting',
    tagline: 'Strategic climate risk assessment',
    description:
      'Deep expertise in climate risk assessment for the wine industry. Drawing on published research and practical experience, we help vineyards and investors understand and manage climate-related risks.',
    features: [
      'Physical risk assessment (acute and chronic)',
      'Transition risk analysis',
      'TCFD-aligned reporting support',
      'Adaptation strategy development',
      'Investment due diligence',
      'Board and executive briefings',
    ],
    icon: TrendingUp,
    cta: {
      label: 'Get in Touch',
      href: '/contact?inquiry=climate-risk',
    },
  },
];

export const getSolutionById = (id: string): Solution | undefined =>
  solutions.find((s) => s.id === id);