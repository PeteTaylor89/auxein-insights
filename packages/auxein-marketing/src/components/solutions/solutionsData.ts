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
  image?: string;
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
    id: 'grow',
    title: 'Auxein Grow',
    image: '/images/solutions/insights-pro.jpg',
    tagline: 'Complete vineyard management platform',
    description:
      'A precision vineyard management platform built by a viticulturist for viticulturists. Grow combines 40 years of block-level climate intelligence, peer-reviewed disease models, and blockchain-verified traceability into one mobile-first platform - turning your daily vineyard work into a compliance engine, a data asset, and a competitive advantage.',
    features: [
      'Property-level climate history from 1986 and CMIP6 projections to 2100',
      'Peer-reviewed disease models for downy mildew, powdery mildew, and botrytis',
      'Phenology tracking with EL-scale observations and harvest timing estimates',
      'GPS-tracked spray tasks with automated GrapeLink-compliant diary generation',
      'Blockchain provenance chain across every spray, observation, and harvest record',
      'Full H&S compliance - risk register, incident reporting, and WorkSafe-aligned workflows',
      'Mobile-first field tools for observations, tasks, alerts, and spray tracking',
    ],
    icon: BarChart3,
    cta: {
      label: 'Explore Auxein Grow',
      href: '/grow',
    },
    badge: 'Coming May 2026',
    comingSoon: true,
  },
  {
    id: 'regional-insights',
    title: 'Regional Intelligence',
    image: '/images/solutions/regional-insights.jpg',
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
    image: '/images/solutions/vineyard-dataset.jpg',
    tagline: 'Complete vineyard boundary dataset',
    description:
      'A comprehensive geodatabase of New Zealand vineyard boundaries, varietals, and management practices. Ideal for research institutions, industry bodies, and agricultural technology companies.',
    features: [
      'National coverage of vineyard boundaries',
      'Varietal and geographic information where available',
      'Regular updates and validation',
      'GeoJSON, Shapefile, and PostGIS formats',
      'API access available',
      'Custom licensing arrangements',
    ],
    icon: Database,
    cta: {
      label: 'Enquire About Licensing and Specification',
      href: '/contact?inquiry=data-licensing',
    },
  },
  {
    id: 'climate-dataset',
    title: 'Climate Dataset',
    image: '/images/solutions/climate-dataset.jpg',
    tagline: 'Historical and projected climate data',
    description:
      'High-resolution vineyard-specific climate data including historical observations and future projections. Built on peer-reviewed methodology from published research on climate impacts on wine quality.',
    features: [
      'Vineyard-scale spatial resolution',
      'Daily temperature, precipitation, radiation, GDD, statistics from 1900 - present',
      'Extensive multi-model seasonal climate projections to 2100',
      'Multiple climate scenarios (RCP/SSP)',
      'Bespoke data services and APIs available',
    ],
    icon: CloudSun,
    cta: {
      label: 'Enquire About Licensing and Specification',
      href: '/contact?inquiry=data-licensing',
    },
  },
  {
    id: 'coastal-risk',
    title: 'Coastal Inundation Risk',
    image: '/images/solutions/coastal-risk.jpg',
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
      label: 'Enquire About Licensing and Specification',
      href: '/contact?inquiry=data-licensing',
    },
  },
  {
    id: 'swnz-consulting',
    title: 'Sustainability Consulting',
    image: '/images/solutions/sustainability.jpg',
    tagline: 'SWNZ | Organic | Certification Support',
    description:
      'Expert guidance to achieve and maintain SWNZ, or any international certification. We help you navigate the requirements, implement best practices, and document your sustainability journey.',
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
    image: '/images/solutions/carbon.jpg',
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
    image: '/images/solutions/climate-risk.jpg',
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