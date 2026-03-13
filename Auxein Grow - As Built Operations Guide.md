# Auxein Grow — As Built Operations Guide
## Platform Administration & User Management

> **Version:** 1.0 — As at 14 March 2026
> **Audience:** Management, Operations, Support Staff
> **Status:** Reflects current build state on `grow-dev` branch

---

## 1. Platform Overview

Auxein Grow is a multi-tenant vineyard management platform. Each **Company** operates as an isolated tenant with its own users, properties, blocks, tasks, and observations.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Company** | A tenant organisation (vineyard, wine company, management company) |
| **Property** | A physical land holding owned by a company |
| **Block** | A vineyard block within a property (has geometry, variety, rootstock, etc.) |
| **User** | A person with login access, always linked to exactly one company |
| **Contractor** | An external service provider who can work across multiple companies |
| **Management Relationship** | A link where one company manages another company's property |

---

## 2. User Roles & Permissions

The platform uses a **5-tier permission hierarchy**. Each user is assigned exactly one role.

### Role Hierarchy

```
Auxein Admin          ← Auxein staff only. Full system access.
  └── Company Admin   ← Company owner/director. Full company access.
      └── Company Manager  ← Supervisors. Operational access, no user/property management.
          └── Company User     ← Field staff. View + create observations/tasks.
              └── Contractor       ← External. Assigned work only.
```

### What Each Role Can Do

| Capability | Auxein Admin | Company Admin | Manager | User | Contractor |
|-----------|:-:|:-:|:-:|:-:|:-:|
| **System admin panel** | Yes | — | — | — | — |
| **Create companies** | Yes | — | — | — | — |
| **Create/edit properties** | Yes | Yes | — | — | — |
| **Create/edit blocks** | Yes | Yes | — | — | — |
| **Edit block data** | Yes | Yes | Yes | — | — |
| **View blocks on map** | Yes | Yes | Yes | Yes | View assigned |
| **Invite users** | Yes | Yes | — | — | — |
| **Manage user roles** | Yes | Yes | — | — | — |
| **Assign contractors** | Yes | Yes | Yes | — | — |
| **Create tasks** | Yes | Yes | Yes | — | — |
| **Complete tasks** | Yes | Yes | Yes | If assigned | If assigned |
| **Create observations** | Yes | Yes | Yes | Yes | Yes |
| **View all company data** | All companies | Own company | Own company | Own company | Assigned only |
| **Submit timesheets** | — | — | — | Yes | Yes |

---

## 3. Onboarding Flow

### 3.1 New Company Setup (Auxein Admin)

```
Auxein Admin logs in
    │
    ├── Navigate to /admin → Companies → Create Company
    │
    ├── Fill form:
    │   ├── Company name, address, number
    │   ├── Subscription tier
    │   ├── Hectares (for pricing)
    │   ├── Admin user: email, username, first name, last name
    │   ├── Generate password (auto) or set custom
    │   └── Send welcome email: Yes
    │
    ├── System creates:
    │   ├── Company record (with subscription + trial)
    │   └── Admin user (role=admin, user_type=company_admin, pre-verified)
    │
    ├── Welcome email sent with:
    │   ├── Login credentials (username + generated password)
    │   └── Link to login page
    │
    └── Admin copies generated password (clipboard button)
        and provides to company contact
```

**Result:** Company exists with one admin user who can log in immediately.

### 3.2 Company Admin First Login

```
Company Admin receives welcome email
    │
    ├── Logs in with provided credentials
    │
    ├── Changes password (Profile → Change Password)
    │
    └── Ready to set up:
        ├── Properties
        ├── Blocks (via Maps)
        └── Team members (via invitations)
```

### 3.3 Inviting Team Members (Company Admin)

```
Company Admin → Profile → Invitations tab
    │
    ├── Click "Invite Team Member"
    │
    ├── Fill form:
    │   ├── Email address
    │   ├── Role: Admin / Manager / User
    │   ├── First name, last name (optional)
    │   ├── Suggested username (optional)
    │   └── Personal message (optional)
    │
    ├── System creates:
    │   ├── Invitation record (7-day expiry)
    │   └── Generates temporary password (hashed)
    │
    └── Invitation email sent with:
        ├── Company name, role, inviter name
        ├── Temporary password (plain text, for reference)
        └── "Complete Account Setup" link
```

### 3.4 Accepting an Invitation (New User)

```
New user receives invitation email
    │
    ├── Clicks "Complete Account Setup" link
    │   → Opens /accept-invitation?token=...
    │
    ├── Sees invitation details:
    │   ├── Company name
    │   ├── Role
    │   ├── Inviter name
    │   └── Personal message
    │
    ├── Fills account setup form:
    │   ├── First name, last name
    │   ├── Username (pre-filled with suggestion)
    │   ├── Password (must be 8+ chars, include number + uppercase)
    │   └── Timezone
    │
    ├── Clicks "Complete Setup"
    │   → User account created (pre-verified, active)
    │   → Invitation marked as accepted
    │
    └── Redirected to login page with email pre-filled
        → Logs in with chosen credentials
```

### 3.5 Password Reset (Any User)

```
User → Login page → "Forgot your password?"
    │
    ├── Enter email address
    │   → Reset email sent (24-hour expiry)
    │
    ├── Click link in email → /reset-password?token=...
    │
    ├── Enter new password (8+ chars, number, uppercase)
    │
    └── Redirected to login → use new password
```

---

## 4. Property & Block Management

### 4.1 Creating Properties (Company Admin)

Properties represent physical land holdings. They are created by company admins.

**Via Admin Panel (Auxein Admin):**
- `/admin` → Properties tab → Create property with owner company

**Via Company Profile (Company Admin):**
- Properties can be created through the Properties API
- Assigned to the admin's company automatically

### 4.2 Creating Blocks (Company Admin, via Maps V2)

```
Company Admin → Maps V2 (/maps-v2)
    │
    ├── Select "Draw Block" mode
    │
    ├── Draw polygon on map (click vertices, close shape)
    │
    ├── Fill BlockCreateForm:
    │   ├── Block name, variety, clone, rootstock
    │   ├── Row spacing, vine spacing, row count
    │   ├── Region, training system
    │   ├── Property (dropdown — auto-selected if only one)
    │   └── Area (auto-calculated from geometry)
    │
    └── Submit → Block created + blockchain chain auto-created
```

### 4.3 Editing Blocks (Company Admin + Manager)

- **Edit metadata:** Click block on map → Edit form (name, variety, etc.)
- **Edit geometry:** Drag vertices on map → Save
- **Assign to property:** Edit form → Property dropdown
- **Split block:** Draw split line across block → creates child blocks

### 4.4 Block Visibility Rules

| User Type | What They See |
|-----------|--------------|
| Auxein Admin | ALL blocks across all companies |
| Company Admin | All blocks in company + blocks on managed properties |
| Company Manager | Same as admin (company-scoped) |
| Company User | Company blocks (or property-scoped if scopes set) |
| Contractor | Blocks on assigned tasks only |

### 4.5 Property Management Relationships

A company can **own** properties and **manage** other companies' properties:

```
Company A (Owner)
  └── Property "Vineyard Estate"
        └── Managed by: Company B (Management Company)
              ├── Company B users can view/edit blocks
              └── Company A users can view (read-only)
```

- **Owner:** Creates the property, retains ownership
- **Manager:** Assigned via management relationship, gets operational access
- **Owner Read-Only:** When a property is externally managed, the owner cannot edit blocks/tasks on it

---

## 5. Contractor Management

### 5.1 Contractor Lifecycle

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│ Admin Creates    │ ──► │ Relationship │ ──► │ Assigned to  │
│ Contractor       │     │ Created      │     │ Tasks        │
│ (Admin Portal)   │     │ (Pending)    │     │              │
└─────────────────┘     └──────┬───────┘     └──────┬──────┘
                               │                     │
                        ┌──────▼───────┐     ┌──────▼──────┐
                        │ Relationship │     │ Check-in /  │
                        │ Activated    │     │ Check-out   │
                        └──────────────┘     │ (Biosecurity)│
                                             └─────────────┘
```

### 5.2 Creating Contractors (Auxein Admin)

```
Auxein Admin → /admin → Contractors tab
    │
    ├── Click "New Contractor"
    │
    ├── Fill form:
    │   ├── Business name, contact person
    │   ├── Email, phone
    │   ├── Type: Individual / Company / Partnership
    │   ├── Specializations (multi-select)
    │   ├── Link to company (optional)
    │   └── Generate password + pre-verify
    │
    └── Contractor created → can be assigned to companies
```

### 5.3 Contractor-Company Relationships

- **Created by:** Auxein Admin (at creation) or Company Admin (via contractor management)
- **Statuses:** Pending → Active → Suspended / Terminated
- **Scope:** A contractor can have active relationships with multiple companies

### 5.4 Assigning Contractors to Tasks

```
Company Admin/Manager → Task → Assign Contractor
    │
    ├── Select from contractors with active relationships
    │
    ├── Assignment created (status: assigned)
    │
    └── Contractor can:
        ├── Accept / Decline assignment
        ├── Log check-in (with biosecurity declaration)
        ├── Complete work
        ├── Log check-out
        └── Submit hours
```

### 5.5 Biosecurity Tracking

Each contractor movement is tracked:
- **Check-in:** GPS location, purpose, equipment brought, biosecurity declaration
- **Check-out:** Work summary, hours worked, equipment cleaned confirmation
- **Risk factors:** Previous vineyard visited, high-risk crops exposure

---

## 6. System Administration (Auxein Admin)

### 6.1 Admin Portal (/admin)

The system admin portal has four tabs:

| Tab | Capabilities |
|-----|-------------|
| **Companies** | Create company + admin, list/search companies, update subscription, deactivate/reactivate |
| **Users** | List all users system-wide, filter by company/role/status, change roles, suspend/unsuspend, delete |
| **Properties** | List all properties with owner/manager info, create/edit/delete properties |
| **Contractors** | Create contractors, edit details, suspend/reactivate, delete |

### 6.2 Company Admin Panel (Profile page)

Company admins see additional tabs in their Profile page:

| Tab | Capabilities |
|-----|-------------|
| **Company Users** | View team members, roles, status |
| **Invitations** | Send invitations, view pending/accepted/expired |
| **Contractors** | View contractors linked to company, manage relationships |

### 6.3 Subscription & Billing

- Each company has a subscription tier
- Pricing based on hectares under management
- Trial periods configurable (default 14 days)
- Subscription statuses: Active, Trialing, Suspended

---

## 7. Data Architecture (Simplified)

```
Company (tenant)
  ├── Users (login accounts)
  ├── Properties (land holdings)
  │     ├── ManagementRelationship → Company (manager)
  │     ├── UserPropertyScope → User (optional staff scoping)
  │     └── VineyardBlocks (mapped areas)
  │           ├── BlockchainChain (provenance record)
  │           │     └── BlockchainNodes → Events
  │           ├── Observations
  │           └── Tasks
  │                 └── ContractorAssignments
  ├── ContractorRelationships → Contractor
  └── Subscription (billing tier)
```

---

## 8. Email Communications

### Automated Emails

| Trigger | Email | Recipient |
|---------|-------|-----------|
| Admin creates company | Welcome email with credentials | New company admin |
| User invited to company | Invitation email with setup link | Invited person |
| Password reset requested | Reset link (24hr expiry) | Requesting user |
| User registration (self-service) | Verification email | New user |
| Contractor registration | Verification email | New contractor |

### Email Configuration
- Sent via SMTP (configurable)
- HTML + plain text alternatives
- NZ UEM Act 2007 compliant (unsubscribe footer on marketing emails)
- Dev mode: emails logged but not sent (SEND_EMAILS=false)

---

## 9. Security Features

| Feature | Detail |
|---------|--------|
| **Authentication** | JWT tokens (access: 15min, refresh: 7 days) |
| **Password requirements** | 8+ characters, number, uppercase letter |
| **Account lockout** | 5 failed attempts → 30-minute lock |
| **Multi-tenancy isolation** | Every API endpoint filters by company_id |
| **Role-based access** | 5-tier hierarchy enforced at API level |
| **Contractor isolation** | Access only via explicit relationship + task assignment |
| **Blockchain provenance** | Every block has an immutable event chain |

---

## 10. Current Limitations & Planned Work

| Area | Current State | Planned |
|------|--------------|---------|
| **Mobile app** | Stub only | Full React Native build (Phase E-F) |
| **Contractor scheduling** | Basic assignment | Calendar/date-range picking |
| **Property scoping UI** | Backend ready, no UI | Profile → scope users to properties |
| **Disease models** | 3 models implemented | Weather station integration |
| **Map layers** | Blocks + parcels | Disease pressure, phenology, weather overlays |
| **Bulk operations** | Backend stubs | UI for bulk import/export |
| **Reporting** | Basic stats on home | PDF/CSV export, analytics dashboard |

---

## 11. Quick Reference: URLs

| App | URL | Purpose |
|-----|-----|---------|
| **Grow Pro** | http://localhost:5173 | Main management app |
| **Regional Insights** | http://localhost:5174 | Public-facing insights app |
| **Backend API** | http://localhost:8000 | FastAPI backend |
| **API Documentation** | http://localhost:8000/docs | Swagger/OpenAPI docs |

---

## 12. Support & Contacts

- **Technical support:** support@auxein.co.nz
- **System admin:** pete.taylor@auxein.co.nz
- **Bug reports:** Via admin portal or email

---

*Document generated 14 March 2026. Reflects `grow-dev` branch state.*
