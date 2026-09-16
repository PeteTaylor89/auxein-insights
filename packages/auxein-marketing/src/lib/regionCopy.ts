import type { Region } from '@/lib/pricing';

/**
 * Copy that changes by region.
 *
 * This is NOT a relabelling exercise. Grow's statutory layer is genuinely
 * New Zealand-only in the product, so the Australian variant drops those
 * claims rather than renaming them:
 *
 *   - Notifiability is `Incident.determine_notifiability()`, hardcoded to the
 *     three HSWA categories per WorkSafe guide WSNZ_4705, matching on
 *     NZ_INJURY_TYPES. There is no Australian WHS equivalent in the product,
 *     so the AU copy claims severity + investigation + corrective actions,
 *     all of which are real fields on the incident.
 *   - Certification is a boolean column literally named `swnz` on
 *     vineyard_blocks and in assets' `certified_for`. Organic, Biodynamic and
 *     Regenerative are real alongside it; Sustainable Winegrowing Australia
 *     is not, so it is not named.
 *   - `registration_number` is commented "ACVM number for chemicals". The
 *     field is generic, the scheme is not, so AU says "product registration".
 *
 * If any of that changes in the product, update here first.
 */
export interface RegionCopy {
  complianceIntro: string;
  compliance: string[];
  /** Qualifier under the checklist. Null where there is nothing to qualify. */
  complianceNote: string | null;
  /** Overrides applied over the base `tour` entries, keyed by tour id. */
  tour: Record<string, { body?: string; points?: string[] }>;
}

const SHARED_COMPLIANCE = {
  spray:
    'Every spray recorded against the block, the product, the rate and the operator',
  headcount:
    'Staff sign-on, visitor register and contractor check-in as one evacuation headcount',
  calibration:
    'Sprayer calibration records with the pass or fail and the measured output',
  induction:
    'Induction and site-access records against the person and the property',
};

export const REGION_COPY: Record<Region, RegionCopy> = {
  NZ: {
    complianceIntro:
      'Organics, SWNZ and export market audits all ask the same question in different words: show me what you did, when, where, and who did it. Grow answers it from the record it kept while you worked.',
    compliance: [
      SHARED_COMPLIANCE.spray,
      'SWNZ, Organic, Biodynamic and Regenerative certification held per block',
      'WorkSafe notifiability decided at the moment an incident is reported',
      SHARED_COMPLIANCE.headcount,
      SHARED_COMPLIANCE.calibration,
      SHARED_COMPLIANCE.induction,
    ],
    complianceNote: null,
    tour: {},
  },

  AU: {
    complianceIntro:
      'Organics, sustainability and export market audits all ask the same question in different words: show me what you did, when, where, and who did it. Grow answers it from the record it kept while you worked.',
    compliance: [
      SHARED_COMPLIANCE.spray,
      'Organic, Biodynamic and Regenerative certification held per block',
      'Incidents recorded with their severity, the investigation and the corrective actions',
      SHARED_COMPLIANCE.headcount,
      SHARED_COMPLIANCE.calibration,
      SHARED_COMPLIANCE.induction,
    ],
    complianceNote:
      'Grow was built to New Zealand rules. WorkSafe notifiability and SWNZ certification are New Zealand-only today - everything above works the same across the Tasman. Ask us about WHS notification and Sustainable Winegrowing Australia.',
    tour: {
      safety: {
        body: 'Risks are rated before and after controls. Actions are the controls that reduce them. Incidents record what happened and how severe it was, then hold the investigation and the corrective actions. Everyone on site can report; manager and above investigate and close.',
        points: [
          'Inherent and residual risk matrices',
          'Severity set at the point of reporting, with the investigation opened alongside it',
          'Staff sign-on, visitors and contractors in one on-site list',
        ],
      },
      assets: {
        body: 'Equipment carries hours, calibration specs, maintenance intervals and compliance dates. Consumables carry stock levels, application rates, withholding periods, product registration numbers and certification ticks - so the spray you reach for is the one your certification allows.',
      },
    },
  },
};
