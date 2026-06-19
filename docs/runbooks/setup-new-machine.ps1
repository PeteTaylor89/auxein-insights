<#
.SYNOPSIS
    Bootstraps a new Windows laptop for Auxein full-stack development.

.DESCRIPTION
    Installs core runtimes/tools via winget, installs global npm packages,
    clones (optional) and builds the monorepo (JS workspaces + Python venv).
    Secret files (.env, .aws, .expo, .gitconfig, .claude) CANNOT be automated
    and must be copied manually - the script prints a checklist at the end.

.PARAMETER RepoUrl
    Git URL to clone. If omitted, the script assumes the repo already exists
    at -RepoPath (or that you'll clone it yourself).

.PARAMETER RepoPath
    Target repo folder. Default: .\auxein-insights-V0.1 under the current dir.

.PARAMETER SkipInstalls
    Skip the winget tool installs (use if tools are already present).

.PARAMETER SkipBuild
    Skip npm install / venv build (just install tools).

.EXAMPLE
    .\setup-new-machine.ps1 -RepoUrl https://github.com/PeteTaylor89/<repo>.git

.NOTES
    Run in an elevated PowerShell window for the winget installs.
    Re-runnable: winget skips already-installed packages.
#>

param(
    [string]$RepoUrl,
    [string]$RepoPath = (Join-Path (Get-Location) 'auxein-insights-V0.1'),
    [switch]$SkipInstalls,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg)  { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }

# --- Refresh PATH in the current session after installs ---------------------
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

# ===========================================================================
# 1. TOOL INSTALLS (winget)
# ===========================================================================
if (-not $SkipInstalls) {
    Write-Step '1. Installing core tools via winget'

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget not found. Install 'App Installer' from the Microsoft Store first, then re-run."
    }

    # id = winget package id, name = friendly label
    $packages = @(
        @{ id = 'OpenJS.NodeJS.LTS';            name = 'Node.js LTS (v22.x)' },
        @{ id = 'Python.Python.3.13';           name = 'Python 3.13' },
        @{ id = 'Git.Git';                       name = 'Git (incl. Credential Manager)' },
        @{ id = 'Amazon.AWSCLI';                 name = 'AWS CLI v2' },
        @{ id = 'PostgreSQL.PostgreSQL.17';      name = 'PostgreSQL 17 (client + server)' },
        @{ id = 'PostgreSQL.pgAdmin';            name = 'pgAdmin 4' },
        @{ id = 'Microsoft.VisualStudioCode';    name = 'VS Code' },
        @{ id = 'GitHub.cli';                    name = 'GitHub CLI (gh)' }
    )

    foreach ($p in $packages) {
        Write-Info "Installing $($p.name) ..."
        winget install --id $($p.id) --exact --accept-source-agreements --accept-package-agreements --silent
        if ($LASTEXITCODE -eq 0)            { Write-Ok $p.name }
        elseif ($LASTEXITCODE -eq -1978335189) { Write-Ok "$($p.name) (already installed)" }
        else                                { Write-Warn2 "$($p.name) returned exit $LASTEXITCODE - check manually" }
    }

    Update-SessionPath
    Write-Ok 'PATH refreshed for this session'
} else {
    Write-Step '1. Skipping tool installs (-SkipInstalls)'
}

# ===========================================================================
# 2. GLOBAL NPM PACKAGES
# ===========================================================================
Write-Step '2. Installing global npm packages'
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $globals = @('eas-cli', 'expo-cli', '@expo/ngrok', '@railway/cli', '@anthropic-ai/claude-code')
    npm install -g $globals
    Write-Ok "Installed: $($globals -join ', ')"
} else {
    Write-Warn2 'npm not on PATH yet. Close & reopen PowerShell, then re-run with -SkipInstalls.'
}

# ===========================================================================
# 2b. AWS EB CLI (Python)
# ===========================================================================
Write-Step '2b. Installing AWS Elastic Beanstalk CLI (awsebcli)'
if (Get-Command python -ErrorAction SilentlyContinue) {
    # --user isolates it from the global site-packages and puts the 'eb'
    # launcher under the per-user Scripts dir.
    python -m pip install --user --upgrade awsebcli
    if ($LASTEXITCODE -eq 0) {
        Write-Ok 'awsebcli installed'
        $userScripts = & python -c "import site,os;print(os.path.join(site.USER_BASE,'Scripts'))" 2>$null
        if ($userScripts -and -not (Get-Command eb -ErrorAction SilentlyContinue)) {
            Write-Warn2 "Add this to PATH so 'eb' resolves: $userScripts"
        }
    } else {
        Write-Warn2 'awsebcli install failed - awsebcli deps can clash on Py3.13.'
        Write-Warn2 'Alternative: install pipx, then  pipx install awsebcli'
    }
} else {
    Write-Warn2 'python not on PATH yet. Reopen PowerShell, then re-run with -SkipInstalls.'
}

# ===========================================================================
# 3. CLONE REPO (optional)
# ===========================================================================
Write-Step '3. Repository'
if ($RepoUrl) {
    if (Test-Path $RepoPath) {
        Write-Warn2 "$RepoPath already exists - skipping clone"
    } else {
        Write-Info "Cloning $RepoUrl -> $RepoPath"
        Write-Info '(A browser window may open for GitHub login via Git Credential Manager)'
        git clone $RepoUrl $RepoPath
        Write-Ok 'Clone complete'
    }
} else {
    Write-Info 'No -RepoUrl given; expecting repo to already exist.'
}

if (-not (Test-Path $RepoPath)) {
    Write-Warn2 "Repo not found at $RepoPath - skipping build. Clone it, then re-run with -SkipInstalls."
    $SkipBuild = $true
}

# ===========================================================================
# 4. BUILD (JS workspaces + Python venv)
# ===========================================================================
if (-not $SkipBuild) {
    Write-Step '4. Installing JS dependencies (npm workspaces)'
    Push-Location $RepoPath
    try {
        npm install
        Write-Ok 'Root + workspace deps installed'
        npm run install:all
        Write-Ok 'insights + web deps installed'

        Write-Step '5. Building backend Python venv'
        $backend = Join-Path $RepoPath 'backend'
        Push-Location $backend
        try {
            python -m venv venv
            & .\venv\Scripts\python.exe -m pip install --upgrade pip
            Write-Info 'Installing requirements.txt (geopandas/fiona/shapely may take a while)...'
            & .\venv\Scripts\python.exe -m pip install -r requirements.txt
            Write-Ok 'Backend venv ready'
        } catch {
            Write-Warn2 "Backend pip install failed: $_"
            Write-Warn2 'Geo stack (geopandas/fiona/shapely/pyproj) often needs prebuilt wheels on Win/Py3.13.'
            Write-Warn2 'Fix wheels, then re-run: backend\venv\Scripts\python.exe -m pip install -r requirements.txt'
        } finally {
            Pop-Location
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Step '4. Skipping build (-SkipBuild or repo missing)'
}

# ===========================================================================
# MANUAL STEPS (cannot be automated - secrets)
# ===========================================================================
Write-Step 'MANUAL STEPS - copy these from the OLD machine (USB / encrypted, NOT cloud sync)'
$userHome = $env:USERPROFILE
@"
  1. AWS credentials   ->  $userHome\.aws\        (config + credentials; region ap-southeast-2)
                           Put keys in 'credentials', not 'config'.
  2. Env files (gitignored - one per package):
        <repo>\.env
        <repo>\packages\web\.env            + .env.production
        <repo>\packages\insights\.env       + .env.production
        <repo>\packages\mobile\.env
        <repo>\packages\auxein-marketing\.env.local + .env.production
  3. Expo/EAS login    ->  $userHome\.expo\       (state.json, codesigning, ngrok.yml)
                           Or just run: eas login  /  npx expo login
  4. Git identity      ->  $userHome\.gitconfig   (or run the two git config commands below)
  5. Claude Code       ->  $userHome\.claude\     (includes your project memory folder)
                           RE-KEY IF THE REPO PATH CHANGED (e.g. A:\ -> C:\):
                           Claude keys project memory by repo path, so a plain copy
                           lands under the wrong slug. Launch Claude once from the new
                           repo folder to create the new slug under .claude\projects\,
                           then move the old 'memory' folder into it. Full steps:
                           docs\runbooks\setup-new-dev-machine.md (Repo location & re-key).
  6. pgAdmin servers   ->  export from old pgAdmin, or copy %APPDATA%\pgAdmin

  Git identity (if not copying .gitconfig):
     git config --global user.name  "PeteTaylor89"
     git config --global user.email "pete.k.taylor@gmail.com"
     git config --global core.autocrlf true

  SECURITY: rotate the eb-cli AWS access key in IAM after migration.
"@ | Write-Host -ForegroundColor Yellow

# ===========================================================================
# VERIFY
# ===========================================================================
Write-Step 'Verify installed versions'
Update-SessionPath
foreach ($c in 'node','npm','python','git','aws','eb','psql','eas','code','gh') {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) {
        $v = try { (& $c --version 2>$null | Select-Object -First 1) } catch { '' }
        Write-Ok ("{0,-8} {1}" -f $c, $v)
    } else {
        Write-Warn2 "$c not found on PATH (reopen PowerShell if just installed)"
    }
}

Write-Step 'Done'
Write-Info 'Next: drop in the secret files above, then test from the repo root:'
Write-Info '   npm run dev:all     (backend :8000, insights :5174, web :5173, mobile)'
