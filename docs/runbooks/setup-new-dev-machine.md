# New Machine Setup — Auxein Dev Environment

Everything needed to get a fresh Windows laptop ready for full Auxein development:
backend (FastAPI), web frontends (Pro + Insights), mobile (Expo), marketing,
AWS access, Git, and PostgreSQL/pgAdmin.

There are two halves:

1. **Automated** — `setup-new-machine.ps1` installs tools, npm globals, EB CLI,
   and builds the repo.
2. **Manual** — secret/credential files that **cannot** be automated and must be
   copied from the old machine (USB stick or password manager — **not** cloud sync).

---

## TL;DR

> The script lives at `docs/runbooks/setup-new-machine.ps1` in this repo. Copy
> it out to the new laptop before you've cloned anything.

```powershell
# 1. Create the parent dir and copy setup-new-machine.ps1 into it:
New-Item -ItemType Directory -Force C:\Auxein
#    (drop setup-new-machine.ps1 into C:\Auxein)

# 2. Open an ELEVATED PowerShell window and cd to the parent dir.
#    The script clones to .\auxein-insights-V0.1 UNDER the current dir,
#    so running from C:\Auxein lands the repo at C:\Auxein\auxein-insights-V0.1.
cd C:\Auxein
.\setup-new-machine.ps1 -RepoUrl https://github.com/PeteTaylor89/<repo>.git

# 3. Copy the secret files (see "Manual: secret files" below)
# 4. From the repo root, smoke-test:
cd C:\Auxein\auxein-insights-V0.1
npm run dev:all
```

### Directory layout

Keep everything Auxein under one parent so the repo and the Google Drive mirror
(corporate docs) sit side by side:

```
C:\Auxein\
├─ auxein-insights-V0.1\   <- the app (this repo; cloned by the script)
└─ GoogleDrive\            <- mirror of Auxein corporate docs (Drive for desktop / rclone)
```

> **Where to run the script from:** run it from `C:\Auxein` (the parent). With no
> `-RepoPath` it clones to `.\auxein-insights-V0.1` under the current dir, giving
> `C:\Auxein\auxein-insights-V0.1`. To put it elsewhere, pass
> `-RepoPath C:\some\other\path`.

---

## 1. Automated setup (`setup-new-machine.ps1`)

Run in an **elevated** PowerShell window (winget needs admin). The script is
re-runnable — winget skips anything already installed.

| Flag | Purpose |
|------|---------|
| `-RepoUrl <url>` | Clone the repo (triggers GitHub browser login). Omit if cloning yourself. |
| `-RepoPath <path>` | Where to clone / find the repo. Default: `.\auxein-insights-V0.1`. |
| `-SkipInstalls` | Skip the winget tool installs (use on a re-run once tools exist). |
| `-SkipBuild` | Install tools only; skip `npm install` + venv build. |

### What it installs

**winget:** Node.js 22 LTS · Python 3.13 · Git (+ Credential Manager) ·
AWS CLI v2 · PostgreSQL 17 (client + server) · pgAdmin 4 · VS Code · GitHub CLI

**Global npm:** `eas-cli` · `expo-cli` · `@expo/ngrok` · `@railway/cli` ·
`@anthropic-ai/claude-code`

**Python (EB CLI):** `awsebcli` (via `pip install --user`)

**Build:** `npm install` → `npm run install:all` → backend `venv` +
`pip install -r requirements.txt`

> **If `npm`/`python` aren't found mid-run:** a fresh install sometimes isn't on
> PATH in the current shell. Close & reopen PowerShell, then re-run with
> `-SkipInstalls` to continue from the npm/EB/build steps.

> **Geo stack gotcha:** `geopandas` / `fiona` / `shapely` / `pyproj` sometimes
> fail to build on Windows + Python 3.13. The script catches this and tells you
> to fix the wheels, then re-run just:
> `backend\venv\Scripts\python.exe -m pip install -r requirements.txt`

> **EB CLI on PATH:** `awsebcli` installs the `eb` launcher into your per-user
> `Scripts` dir. If `eb` isn't found afterwards, add the path the script prints
> to your PATH (or reopen PowerShell).

---

## 2. Manual: secret files (copy from old machine)

These are gitignored / credential files. Move them on a USB stick or via a
password manager — **do not** sync them through a public cloud folder in plaintext.

| What | Destination | Notes |
|------|-------------|-------|
| **AWS credentials** | `%USERPROFILE%\.aws\` | `config` + `credentials`. Region `ap-southeast-2`. Profiles: `default`, `eb-cli`. **Put keys in `credentials`, not `config`.** |
| **Env files** | one per package (see below) | Not in git — without them local dev won't run. |
| **Expo/EAS login** | `%USERPROFILE%\.expo\` | Or just run `eas login` / `npx expo login`. |
| **Git identity** | `%USERPROFILE%\.gitconfig` | Or run the commands below. |
| **Claude Code** | `%USERPROFILE%\.claude\` | Includes the project memory folder. **Re-key needed if the repo path changes — see note below.** |
| **pgAdmin servers** | `%APPDATA%\pgAdmin` | Or re-add the RDS connection manually. |

### Env files to copy

```
.env                                         (repo root)
packages\web\.env                +  .env.production
packages\insights\.env           +  .env.production
packages\mobile\.env
packages\auxein-marketing\.env.local  +  .env.production
```

> **`packages\taste\` (Auxein Taste):** has **no** env file of its own, so there's
> nothing to copy. Its JS deps are installed automatically by the root `npm install`
> (it's an npm workspace). It is not wired into `npm run dev:all`; run it on its own
> with `npm run dev:taste` when needed.

### Repo location & Claude Code memory re-key

The old machine kept the repo on a dedicated **`A:`** drive at `A:\auxein-insights-V0.1`.
The new machine has only `C:`, so the repo now lives at `C:\Auxein\auxein-insights-V0.1`
(see Directory layout in the TL;DR). The path doesn't matter for the build, **but Claude
Code keys its project memory by the repo path**, so a plain copy of `.claude\` lands
under the wrong key and the memory won't load.

Claude Code's project folders live under `%USERPROFILE%\.claude\projects\<slug>\`,
where `<slug>` is the repo path with `:` / `\` / `.` flattened to `-`. The old slug was
`A--auxein-insights-V0-1`; the new one will be `C--Auxein-auxein-insights-V0-1`. To carry
the memory across:

1. Copy `%USERPROFILE%\.claude\` from the old machine as usual.
2. Launch Claude Code once from inside the new repo folder so it creates the new
   project slug under `.claude\projects\` (confirm the exact name it creates).
3. Move the old `memory\` folder into that new slug folder:

   ```powershell
   # adjust the slugs to whatever your old/new paths produce
   $old = "$env:USERPROFILE\.claude\projects\A--auxein-insights-V0-1\memory"
   $new = "$env:USERPROFILE\.claude\projects\C--Auxein-auxein-insights-V0-1\memory"
   New-Item -ItemType Directory -Force (Split-Path $new) | Out-Null
   Move-Item $old $new
   ```

> If you'd rather avoid the re-key entirely, recreate an `A:` drive on the new machine
> (`subst A: C:\<folder>` at logon, or a real partition) and clone to
> `A:\auxein-insights-V0.1` — then the old slug matches and `.claude\` copies straight over.

> **One-off copy vs ongoing sync:** the steps above carry the memory across **once**.
> If you work on more than one machine, the two memory folders will then drift apart.
> To keep them identical going forward, use the Google Drive junction below instead.

### Shared Claude memory across machines (Google Drive junction)

Claude memory lives in local markdown files, so git won't sync it. To keep it
**identical on every machine**, store one canonical `claude-memory` folder inside the
work Google Drive (mirrored), and point each machine's `.claude\...\memory` path at it
via a **directory junction**. Both machines then read/write the same files; Drive syncs.

**As-built (the live setup):**

| | Drive account | Local canonical path | Project slug |
|---|---|---|---|
| **Old machine (`A:`)** | pete.taylor@auxein.co.nz (Mirror) | `A:\Shared\claude-memory` | `A--auxein-insights-V0-1` |
| **New machine (`C:`)** | pete.taylor@auxein.co.nz (Mirror) | `C:\Auxein\Auxein\claude-memory` | `C--Auxein-auxein-insights-V0-1` |

> Both paths are the **same Drive folder**, just mirrored to different local roots
> (`A:` vs `C:\Auxein`). Confirm by matching file counts — both should be 62+ and rising.
> Don't assume the local path; **find it** after Drive syncs:
> `Get-ChildItem C:\ -Filter claude-memory -Directory -Recurse -ErrorAction SilentlyContinue`

**Two hard requirements:**

- **Google Drive must be in *Mirror* mode, not *Stream* mode.** Junctions only work
  against real on-disk files. Mirror keeps a local copy; Stream uses a virtual drive
  (the `G:` / `H:` letters) that junctions can't reliably target.
- **Run Claude on only one machine at a time.** Simultaneous edits create Drive
  "conflict copy" files. Memory is small markdown, so this is discipline, not a real limit.

Seed from whichever machine holds the authoritative memory (the old `A:` machine).

**1. Both machines — Google Drive for desktop, signed into `pete.taylor@auxein.co.nz`,
My Drive set to Mirror.** On the new machine the mirror root is `C:\Auxein`. Let it sync.

**2. Authoritative machine (`A:`) — seed the canonical folder and junction:**

```powershell
$canonical = "A:\Shared\claude-memory"
$slug      = "A--auxein-insights-V0-1"
$local     = "$env:USERPROFILE\.claude\projects\$slug\memory"

New-Item -ItemType Directory -Force $canonical | Out-Null
Copy-Item "$local\*" $canonical -Recurse -Force  # seed Drive from current memory
Rename-Item $local "memory.bak"                  # back up, then free the path
cmd /c mklink /J "$local" "$canonical"           # junction local -> Drive
Get-Item $local | Select-Object LinkType, Target # verify: Junction -> A:\Shared\claude-memory
```

Wait for the Drive tray icon to show **fully synced** before continuing.

**3. New machine (`C:`) — launch Claude once to create the slug folder, then junction:**

```powershell
# confirm the slug Claude created, and where Drive synced the folder:
Get-ChildItem "$env:USERPROFILE\.claude\projects" | Select-Object Name
Get-ChildItem C:\ -Filter claude-memory -Directory -Recurse -ErrorAction SilentlyContinue | Select-Object FullName

$canonical = "C:\Auxein\Auxein\claude-memory"             # from the find above
$slug      = "C--Auxein-auxein-insights-V0-1"             # from the slug list above
$local     = "$env:USERPROFILE\.claude\projects\$slug\memory"

Test-Path "$canonical\MEMORY.md"                 # MUST be True (synced down) before continuing
if (Test-Path $local) { Rename-Item $local "memory.bak" }
cmd /c mklink /J "$local" "$canonical"
Get-Item $local | Select-Object LinkType, Target
```

**Notes**

- Use `mklink /J` (junction) — no admin needed, right type for a local-folder target.
  Don't use `/D` (symlink): needs admin and behaves worse with Drive.
- To **remove/re-point** a junction, use `cmd /c rmdir "<link>"` — it deletes the link
  only, never the target. Do **not** `Remove-Item -Recurse` a junction (can nuke the target).
- Keep the `memory.bak` folders a few days as a safety net, then delete.
- This shares **memory only**. `.env`, `.aws`, etc. remain per-machine.
- A conflict copy (e.g. `MEMORY (1).md`) means both machines wrote — merge/delete the dupe.

### Git identity (if not copying `.gitconfig`)

```powershell
git config --global user.name  "PeteTaylor89"
git config --global user.email "pete.k.taylor@gmail.com"
git config --global core.autocrlf true
```

---

## 3. Verify

```powershell
aws sts get-caller-identity                  # default profile
aws sts get-caller-identity --profile eb-cli # EB deploy profile
node -v; python --version; git --version; eb --version
psql --version; eas --version
```

From the repo root:

```powershell
npm run dev:backend    # FastAPI      -> http://localhost:8000
npm run dev:web        # Pro web      -> http://localhost:5173
npm run dev:insights   # Insights web -> http://localhost:5174
npm run dev:all        # everything (+ mobile via Expo)
```

---

## 4. Editor

Install VS Code (done by the script) and sign in with **Settings Sync** to pull
your extensions, settings, and keybindings automatically. Typical extensions for
this stack: Python, Pylance, ESLint, Prettier, AWS Toolkit.

---

## 5. Post-migration security

- Move AWS keys out of `.aws\config` into `.aws\credentials`.
- **Rotate the `eb-cli` AWS access key** in IAM after the new machine is working —
  good hygiene for any credential that's been carried between machines.

---

## Reference: stack at time of writing

- **Node** v22.x LTS · **Python** 3.13.x · **PostgreSQL** 17 · **AWS region** `ap-southeast-2`
- Monorepo: npm workspaces under `packages/*`; backend FastAPI in `backend/`
- Deploy: backend on AWS Elastic Beanstalk (`eb-cli` profile); web on S3+CloudFront; mobile via EAS
