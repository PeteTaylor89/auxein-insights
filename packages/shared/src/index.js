// packages/shared/src/index.js

// API Services
export * from './api/index.js';

// Contexts
export { AuthProvider, useAuth } from './contexts/AuthContext.jsx';

// Utils
export { hasPermission, getPermissionsForUserType, isAdminType, isManagerOrAbove, UserType } from './utils/permissions.js';
export { compareNatural, byNatural } from './utils/naturalSort.js';
export {
  TASK_STATUS_META,
  TASK_STATUS_VALUES,
  getTaskStatusMeta,
  TASK_STATUS_STARTABLE,
  TASK_STATUS_ACTIVE,
  TASK_STATUS_FINISHED,
} from './utils/taskStatus.js';
export {
  BLOCK_STATUS_META,
  BLOCK_STATUS_VALUES,
  BLOCK_STATUS_OPTIONS,
  getBlockStatusMeta,
  BLOCK_STATUS_DEFAULT,
  BLOCK_STATUS_ACTIVE,
  BLOCK_STATUS_PRODUCTIVE,
} from './utils/blockStatus.js';
export {
  TIMESHEET_STATUS_META,
  TIMESHEET_STATUS_VALUES,
  TIMESHEET_DAY_EDITABLE,
  isDayEditable,
  canSubmitDay,
  dayLockReason,
  rejectionReason,
} from './utils/timesheetStatus.js';
export {
  isStickyField,
  nextSpotValues,
  carriedFieldNames,
} from './utils/observationSticky.js';

// Hooks
export { default as usePullToRefresh } from './hooks/usePullToRefresh.js';
export { 
  useTrainingModules,
  useTrainingModule, 
  useTrainingSlides, 
  useTrainingQuestions,
  useTrainingStats,
  useTrainingAssignments,
  useTrainingTaking,
  useImageUpload
} from './hooks/useTrainingModules.js';
