// packages/shared/src/utils/permissions.js
// Frontend permission matrix — mirrors backend/core/permissions.py

export const UserType = {
  AUXEIN_ADMIN: 'auxein_admin',
  COMPANY_ADMIN: 'company_admin',
  COMPANY_MANAGER: 'company_manager',
  COMPANY_USER: 'company_user',
  CONTRACTOR: 'contractor',
  // Health-and-safety only, mobile only. Signs on and off a property, raises
  // incidents, signs visitors in, reads the risk register and the map.
  GENERAL_USER: 'general_user',
};

// Permission matrix: module -> action -> allowed user types
const PERMISSIONS = {
  blocks: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  observations: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  tasks: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    assign: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  // Mirrors backend/core/permissions.py. Reports aggregate across the whole
  // company — labour cost, incidents, who was on site — so they stop at
  // manager. Deliberately no contractor entry: a contractor must never see a
  // company-wide roll-up, and the backend enforces the same with
  // require_company_user_permission.
  reports: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    export: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  // Pay rates and task costs. ADMIN ONLY, and deliberately not riding on
  // `timesheets` or `reports` — a company_manager holds both, and a task cost
  // divided by its hours is an hourly rate. Mirrors backend/core/permissions.py;
  // a module missing here silently answers false for everyone, so the tab it
  // gates never renders for anybody.
  costs: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    export: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  risks: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.GENERAL_USER],
    // Present on the backend and missing here until 2026-09-01: a general_user
    // and a company_user see the risks they raised, not the whole register.
    read_own: [UserType.COMPANY_USER, UserType.GENERAL_USER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    approve:[UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  users: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  training: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    assign: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  // A general_user records its OWN hours (2026-09-02). read/approve stay with
  // managers: the H&S account never sees anybody else's timesheet.
  timesheets: {
    read:     [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    read_own: [UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    create:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    update:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    approve:  [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    submit:   [UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    delete:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  // Incidents. This module was MISSING from both matrices until 2026-09-02, so
  // every incidents check answered false for everyone. Reporting one is the one
  // thing anybody standing on a site must be able to do; reading the whole
  // register is a manager's job.
  incidents: {
    create:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    read:     [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    read_own: [UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    update:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    close:    [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  climate: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    import: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  assets: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  settings: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  billing: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  subscriptions: {
    read:   [UserType.AUXEIN_ADMIN],
  },
  notifications: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    mark_read: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
  },
  // Properties. Missing from this mirror entirely until 2026-09-02, so every
  // properties check answered false for everyone on the frontend. `read` is
  // wide — you cannot pick a site to sign on to, report an incident at, or
  // raise a risk against without being able to name it.
  properties: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.GENERAL_USER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
    manage: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  // The visitor book. A general_user signs visitors IN but cannot read the
  // register back — the same split the backend makes.
  visitors: {
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.GENERAL_USER],
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  // Map layers.
  map_feature_types: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
  },
  spatial_areas: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.GENERAL_USER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
  // Signing on and off a property. `create` is signing YOURSELF on, which
  // anyone with the app can do; `read` is who-is-on-site-now and stops at
  // manager.
  site_attendance: {
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR, UserType.GENERAL_USER],
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    delete: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN],
  },
};

/**
 * Check if a user type has permission for a module/action
 */
export function hasPermission(userTypeRole, module, action) {
  if (!userTypeRole || !module || !action) return false;
  const modulePerms = PERMISSIONS[module];
  if (!modulePerms) return false;
  const allowed = modulePerms[action];
  if (!allowed) return false;
  return allowed.includes(userTypeRole);
}

/**
 * Get all permissions for a user type as { module: [actions] }
 */
export function getPermissionsForUserType(userTypeRole) {
  const result = {};
  for (const [module, actions] of Object.entries(PERMISSIONS)) {
    const allowed = [];
    for (const [action, types] of Object.entries(actions)) {
      if (types.includes(userTypeRole)) {
        allowed.push(action);
      }
    }
    if (allowed.length > 0) {
      result[module] = allowed;
    }
  }
  return result;
}

/**
 * Check if a user type is an admin-level type
 */
export function isAdminType(userTypeRole) {
  return [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN].includes(userTypeRole);
}

/**
 * Check if a user type is a manager-or-above type
 */
export function isManagerOrAbove(userTypeRole) {
  return [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER].includes(userTypeRole);
}

export default PERMISSIONS;
