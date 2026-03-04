// packages/shared/src/utils/permissions.js
// Frontend permission matrix — mirrors backend/core/permissions.py

export const UserType = {
  AUXEIN_ADMIN: 'auxein_admin',
  COMPANY_ADMIN: 'company_admin',
  COMPANY_MANAGER: 'company_manager',
  COMPANY_USER: 'company_user',
  CONTRACTOR: 'contractor',
};

// Permission matrix: module -> action -> allowed user types
const PERMISSIONS = {
  blocks: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
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
  risks: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER],
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
  timesheets: {
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    approve:[UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
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
    read:   [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
    create: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER],
    update: [UserType.AUXEIN_ADMIN, UserType.COMPANY_ADMIN, UserType.COMPANY_MANAGER, UserType.COMPANY_USER, UserType.CONTRACTOR],
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
