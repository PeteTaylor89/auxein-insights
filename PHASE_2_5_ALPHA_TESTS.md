# Phase 2.5 Alpha Test Checklist — Permissions Overhaul

**Status**: IN PROGRESS
**Date**: 2026-03-05
**Tester**: Pete Taylor

Mark items with `[x]` for pass, `[!]` for fail (add notes), `[-]` for skipped.

---

## 1. Server Startup
- [x] Backend starts without import errors
- [x] Alembic migration runs cleanly (`alembic upgrade head`)
- [x] Frontend (web) compiles and loads without errors

## 2. Login & Token
- [x] Login as auxein_admin — server log shows `Role: auxein_admin`
- [x] Login as a company_admin — server log shows `Role: company_admin`
- [x] Login as a company_user — server log shows `Role: company_user`
- [-] Login as a contractor — server log shows `Role: contractor`
- [! all are being displayed as company_user] After login, `localStorage.userTypeRole` has correct value
- [x] Logout clears both `userType` and `userTypeRole` from localStorage

## 3. Dashboard & Navigation (No-Regression)
- [x] Dashboard loads normally after login
- [x] All nav links work (Map, Observations, Assets, Risks, Calendar, Insights, Profile)
- [x] Mobile bottom nav renders correctly
- [x] Profile page loads without errors (subscription pricing fix)
- [x] Token refresh works silently (no 500 errors in console)

## 4. Permission-Gated Routes — auxein_admin
- [x] Can access admin panel (`/api/v1/admin/companies`)
- [x] Can list all users across companies
- [x though, we will be in a future stage massively simplifying this as there will only be one sub tier with Grow] Can view subscriptions list (`/api/v1/subscriptions/`)
- [- will be redesigning the maps page] Can see spatial areas with `scope=all`
- [- will be redesigning the maps page] Can create/update/delete any company's blocks
- [-] Can manage any company's assets, observations, tasks

## 5. Permission-Gated Routes — company_admin
- [x] Can create/invite users for own company
- [x] Can manage company settings
- [x] Can CRUD blocks, assets, observations, tasks, risks (own company)
- [! tasksService.getFilteredTasks is not a function, seperate bug to iron out] Can approve/reject timesheets
- [x] Can manage training modules
- [x] Cannot access other companies' data
- [x] Cannot access `/api/v1/admin/` endpoints (unless also auxein_admin)

## 6. Permission-Gated Routes — company_manager
- [! 403 error ERROR: 'NoneType' object has no attribute 'HTTP_403_FORBIDDEN'] Can read users list (own company)
- [- couldn't read so couldn't proceed] Cannot create or delete users
- [x] Can CRUD observations, tasks, risks (own company)
- [-] Can approve timesheets
- [-] Can assign training
- [x] Cannot delete blocks or assets
- [x] Cannot access settings or billing

## 7. Permission-Gated Routes — company_user
- [x] Can read blocks, observations, tasks, assets (own company)
- [x] Can create observations and risks
- [! can create assets, can create spatial areas, didn't test on blocks] Cannot create tasks, blocks, or assets
- [x] Cannot delete anything
- [x] Cannot access admin, settings, billing, user management routes
- [x] Cannot approve timesheets

## 8. Permission-Gated Routes — contractor
- [-] Can read assigned company data (blocks, observations, tasks, risks)
- [-] Can create observations and timesheets
- [-] Cannot access users, settings, billing
- [-] Cannot delete anything
- [-] Cannot upload files (contractors blocked in upload endpoint)

## 9. Tenant Isolation (Critical)
- [x] Non-admin users cannot see data from other companies
- [x] auxein_admin can bypass company filter (spatial areas `scope=all`, admin panel)
- [-] Contractor sees only data from companies with active relationships
- [x] File download respects company boundaries

## 10. Specific Module Regression
- [x] Calibrations — list, create, update, delete
- [x] Maintenance — list, create, update, delete
- [x] File upload and download
- [x] Training module access and completion
- [! user type not coming through] Risk dashboard loads, permissions endpoint returns `user_type` in response
- [-] Invitations — create and accept flow
- [-] Timesheet — submit, release, approve, reject
- [-] Climate data — read, import (admin only)
- [x] Spatial areas — list, create, update, delete

## 11. Frontend Auth Context (Browser Console)
- [-] `useAuth()` returns `userTypeRole` (not null)
- [-] `hasPermission('blocks', 'read')` returns `true` for all user types
- [-] `hasPermission('users', 'create')` returns `true` only for admin types
- [-] `isAdmin` boolean is correct per user type
- [-] `isManagerOrAbove` boolean is correct per user type

## 12. Bugs Found During Testing

| # | Description | Severity | Status | Notes |
|---|-------------|----------|--------|-------|
| 1 | SubscriptionWithPricing missing created_at/updated_at | High | FIXED | `to_dict()` updated |
| 2 | Refresh token returning tuples instead of strings | High | FIXED | Pre-existing bug, unpacked tuples |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

---
## Notes for Claude
- as we run throught he specific frontend components we will undertake some more detailed testing expecially in relation to user types and access. Generally I am happy wiht how this looks at the moment 


## Notes
- The `user_type` in server logs is the **routing key** (always `company_user` or `contractor`). The **5-tier role** is logged as `Role:` in the deps.py output.
- Migration must be run (`alembic upgrade head`) before testing — it adds the `user_type` column and backfills from existing `role` values.
- Frontend ProtectedRoute now supports `allowedUserTypes` and `requiredPermission` props but no routes use them yet — that's a follow-up task.
