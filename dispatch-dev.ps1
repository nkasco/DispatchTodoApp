<#
.SYNOPSIS
    Dispatch developer launcher for the Dispatch task management app.

.DESCRIPTION
    Provides commands to set up, start, update, and manage your Dispatch instance.

.PARAMETER Command
    The command to run: setup, dev, start, build, update, seed, studio, test, publish, resetdb, help

.EXAMPLE
    .\dispatch-dev.ps1 setup
    .\dispatch-dev.ps1 setup full
    .\dispatch-dev.ps1 dev
    .\dispatch-dev.ps1 update
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("setup", "dev", "start", "build", "update", "seed", "studio", "test", "lint", "publish", "resetdb", "help", "version", "")]
    [string]$Command = "",
    [Parameter(Position = 1)]
    [ValidateSet("", "full")]
    [string]$SetupMode = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ── Version ───────────────────────────────────────────────────
$PackageJson = Get-Content -Raw -Path "$PSScriptRoot\package.json" | ConvertFrom-Json
$Version = $PackageJson.version

# ── Colors ────────────────────────────────────────────────────
function Write-Cyan    { param([string]$Text) Write-Host $Text -ForegroundColor Cyan -NoNewline }
function Write-CyanLn  { param([string]$Text) Write-Host $Text -ForegroundColor Cyan }
function Write-DimLn   { param([string]$Text) Write-Host $Text -ForegroundColor DarkGray }
function Write-GreenLn { param([string]$Text) Write-Host $Text -ForegroundColor Green }
function Write-YellowLn{ param([string]$Text) Write-Host $Text -ForegroundColor Yellow }
function Write-RedLn   { param([string]$Text) Write-Host $Text -ForegroundColor Red }

# ── Logo ──────────────────────────────────────────────────────
function Show-Logo {
    $logo = @(
        @{ Color = "Cyan";     Text = "  ██████╗ ██╗███████╗██████╗  █████╗ ████████╗ ██████╗██╗  ██╗" }
        @{ Color = "Cyan";     Text = "  ██╔══██╗██║██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║" }
        @{ Color = "DarkCyan"; Text = "  ██║  ██║██║███████╗██████╔╝███████║   ██║   ██║     ███████║" }
        @{ Color = "Blue";     Text = "  ██║  ██║██║╚════██║██╔═══╝ ██╔══██║   ██║   ██║     ██╔══██║" }
        @{ Color = "Blue";     Text = "  ██████╔╝██║███████║██║     ██║  ██║   ██║   ╚██████╗██║  ██║" }
        @{ Color = "DarkBlue"; Text = "  ╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝" }
    )
    Write-Host ""
    foreach ($line in $logo) {
        Write-Host $line.Text -ForegroundColor $line.Color
    }
    Write-Host ""
    Write-DimLn "  v$Version - Developer launcher (requires npm)"
    Write-Host ""
}

# ── Help ──────────────────────────────────────────────────────
function Show-Help {
    Show-Logo

    Write-Host "  USAGE" -ForegroundColor White
    Write-Host "    .\dispatch-dev.ps1 " -NoNewline; Write-CyanLn "<command>"
    Write-Host ""
    Write-Host "  COMMANDS" -ForegroundColor White

    $commands = @(
        @{ Cmd = "setup";   Desc = "Interactive setup (.env + Docker Compose startup)" }
        @{ Cmd = "dev";     Desc = "Start the development server (http://localhost:3000)" }
        @{ Cmd = "start";   Desc = "Start the production server" }
        @{ Cmd = "build";   Desc = "Create a production build" }
        @{ Cmd = "update";  Desc = "Pull latest changes, install deps, run migrations" }
        @{ Cmd = "seed";    Desc = "Load sample data into the database" }
        @{ Cmd = "studio";  Desc = "Open Drizzle Studio (database GUI)" }
        @{ Cmd = "test";    Desc = "Run the test suite" }
        @{ Cmd = "lint";    Desc = "Run ESLint" }
        @{ Cmd = "publish"; Desc = "Build dev image, tag, and push container image" }
        @{ Cmd = "resetdb"; Desc = "Remove dev Docker volumes (fresh SQLite state)" }
        @{ Cmd = "version"; Desc = "Show version number" }
        @{ Cmd = "help";    Desc = "Show this help message" }
    )

    foreach ($c in $commands) {
        Write-Host "    " -NoNewline
        Write-Host ("{0,-10}" -f $c.Cmd) -ForegroundColor Cyan -NoNewline
        Write-Host $c.Desc -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-DimLn "  Tip: '.\dispatch-dev.ps1 setup full' performs full dev Docker cleanup first."
    Write-Host ""
}

# ── Prerequisite checks ──────────────────────────────────────
function Assert-NodeModules {
    if (-not (Test-Path "$PSScriptRoot\node_modules")) {
        Write-YellowLn "  Dependencies not installed. Running npm install..."
        Write-Host ""
        Set-Location $PSScriptRoot
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-RedLn "  npm install failed. Please fix errors and retry."
            exit 1
        }
        Write-Host ""
    }
}

# ── Commands ──────────────────────────────────────────────────
function Invoke-FullDevCleanup {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-RedLn "  Docker is not installed or not on PATH."
        exit 1
    }

    Write-YellowLn "  Running full dev Docker cleanup..."
    Write-Host ""
    Set-Location $PSScriptRoot

    # Always tear down this compose stack first.
    if (Test-Path "$PSScriptRoot\.env.local") {
        docker compose -f docker-compose.dev.yml --env-file .env.local down -v --remove-orphans
    } else {
        docker compose -f docker-compose.dev.yml down -v --remove-orphans
    }

    # Remove additional Dispatch-related containers that are not registry-backed.
    $containers = docker ps -a --format "{{.ID}}|{{.Image}}|{{.Names}}" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
    $containerIds = @()
    foreach ($line in $containers) {
        $parts = $line -split "\|", 3
        if ($parts.Length -lt 3) { continue }
        $id = $parts[0]
        $image = $parts[1]
        $name = $parts[2]
        $isDispatchRelated = ($name -match "dispatch") -or ($image -match "dispatch")
        $isRegistryImage = $image -match "/"
        if ($isDispatchRelated -and -not $isRegistryImage) {
            $containerIds += $id
        }
    }
    if ($containerIds.Count -gt 0) {
        docker rm -f @containerIds | Out-Null
    }

    # Remove Dispatch-related named volumes.
    $volumeNames = docker volume ls --format "{{.Name}}" | Where-Object { $_ -match "dispatch" }
    if ($volumeNames.Count -gt 0) {
        docker volume rm @volumeNames | Out-Null
    }

    # Remove local Dispatch images (keep registry-backed ghcr images).
    $imageRows = docker image ls --format "{{.Repository}}|{{.Tag}}|{{.ID}}" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
    $imageIds = @()
    foreach ($row in $imageRows) {
        $parts = $row -split "\|", 3
        if ($parts.Length -lt 3) { continue }
        $repo = $parts[0]
        $id = $parts[2]
        $isDispatchRelated = $repo -match "dispatch"
        $isRegistryImage = $repo -match "/"
        if ($isDispatchRelated -and -not $isRegistryImage) {
            $imageIds += $id
        }
    }
    if ($imageIds.Count -gt 0) {
        $uniqueImageIds = $imageIds | Sort-Object -Unique
        docker image rm -f @uniqueImageIds | Out-Null
    }

    Write-GreenLn "  Full dev Docker cleanup complete."
    Write-Host ""
}

function Invoke-Setup {
    param([string]$Mode = "")

    Show-Logo
    if ($Mode -eq "full") {
        Invoke-FullDevCleanup
    }
    Assert-NodeModules
    Set-Location $PSScriptRoot
    npx tsx scripts/setup.ts
}

function Invoke-Dev {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Starting development server..."
    Write-DimLn "  http://localhost:3000"
    Write-Host ""
    Set-Location $PSScriptRoot
    npm run dev
}

function Invoke-Start {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Starting production server..."
    Write-Host ""
    Set-Location $PSScriptRoot
    npm run start
}

function Invoke-Build {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Creating production build..."
    Write-Host ""
    Set-Location $PSScriptRoot
    npm run build
}

function Invoke-Update {
    Show-Logo
    Write-GreenLn "  Updating Dispatch..."
    Write-Host ""

    Set-Location $PSScriptRoot

    # Pull latest changes
    Write-Host "  [1/3] " -NoNewline; Write-CyanLn "Pulling latest changes..."
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-YellowLn "  Git pull failed - you may have local changes. Continuing anyway..."
    }
    Write-Host ""

    # Install dependencies
    Write-Host "  [2/3] " -NoNewline; Write-CyanLn "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-RedLn "  npm install failed."
        exit 1
    }
    Write-Host ""

    # Run migrations
    Write-Host "  [3/3] " -NoNewline; Write-CyanLn "Running database migrations..."
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) {
        Write-YellowLn "  No pending migrations or migration failed. Check db:migrate output."
    }
    Write-Host ""

    Write-GreenLn "  Update complete!"
    Write-Host ""
}

function Invoke-Seed {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Seeding database with sample data..."
    Write-Host ""
    Set-Location $PSScriptRoot
    npm run db:seed
}

function Invoke-Studio {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Opening Drizzle Studio..."
    Write-DimLn "  Browse your database at https://local.drizzle.studio"
    Write-Host ""
    Set-Location $PSScriptRoot
    npm run db:studio
}

function Invoke-Test {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Running tests..."
    Write-Host ""
    Set-Location $PSScriptRoot
    npm test
}

function Invoke-Lint {
    Show-Logo
    Assert-NodeModules
    Write-GreenLn "  Running ESLint..."
    Write-Host ""
    Set-Location $PSScriptRoot
    npm run lint
}

function Get-EnvValueFromFile {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split "=", 2
        if ($parts.Length -ne 2) {
            continue
        }

        if ($parts[0].Trim() -eq $Key) {
            return $parts[1]
        }
    }

    return $null
}

function Invoke-Publish {
    Show-Logo
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-RedLn "  Docker is not installed or not on PATH."
        exit 1
    }

    Set-Location $PSScriptRoot
    $envFile = "$PSScriptRoot\.env.local"

    $sourceImage = if ($env:DISPATCH_DEV_IMAGE) {
        $env:DISPATCH_DEV_IMAGE
    } else {
        Get-EnvValueFromFile -Path $envFile -Key "DISPATCH_DEV_IMAGE"
    }
    if (-not $sourceImage) {
        $sourceImage = "dispatch:latest"
    }

    $targetImage = if ($env:DISPATCH_IMAGE) {
        $env:DISPATCH_IMAGE
    } else {
        Get-EnvValueFromFile -Path $envFile -Key "DISPATCH_IMAGE"
    }
    if (-not $targetImage) {
        $targetImage = "ghcr.io/nkasco/dispatchtodoapp:latest"
    }

    Write-Host "  [1/3] " -NoNewline; Write-CyanLn "Building image ($sourceImage) with docker-compose.dev.yml..."
    if (Test-Path $envFile) {
        docker compose -f docker-compose.dev.yml --env-file .env.local build
    } else {
        docker compose -f docker-compose.dev.yml build
    }
    if ($LASTEXITCODE -ne 0) {
        Write-RedLn "  Docker build failed."
        exit $LASTEXITCODE
    }
    Write-Host ""

    Write-Host "  [2/3] " -NoNewline; Write-CyanLn "Tagging image for publish target ($targetImage)..."
    if ($sourceImage -ne $targetImage) {
        docker tag $sourceImage $targetImage
        if ($LASTEXITCODE -ne 0) {
            Write-RedLn "  Docker tag failed."
            exit $LASTEXITCODE
        }
    } else {
        Write-DimLn "  Source and target image are identical; skipping tag."
    }
    Write-Host ""

    Write-Host "  [3/3] " -NoNewline; Write-CyanLn "Pushing image ($targetImage)..."
    docker push $targetImage
    if ($LASTEXITCODE -ne 0) {
        Write-RedLn "  Docker push failed. Make sure you are logged into the target registry."
        exit $LASTEXITCODE
    }
    Write-Host ""

    Write-GreenLn "  Publish complete: $targetImage"
    Write-Host ""
}

function Invoke-ResetDb {
    Show-Logo
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-RedLn "  Docker is not installed or not on PATH."
        exit 1
    }

    Write-YellowLn "  Removing dev Docker containers and volumes..."
    Write-Host ""
    Set-Location $PSScriptRoot

    if (Test-Path "$PSScriptRoot\.env.local") {
        docker compose -f docker-compose.dev.yml --env-file .env.local down -v --remove-orphans
    } else {
        docker compose -f docker-compose.dev.yml down -v --remove-orphans
    }

    if ($LASTEXITCODE -ne 0) {
        Write-RedLn "  Failed to reset dev Docker data."
        exit $LASTEXITCODE
    }

    Write-GreenLn "  Dev Docker data reset complete."
    Write-Host ""
}

# ── Route ─────────────────────────────────────────────────────
if ($SetupMode -and $Command -ne "setup") {
    Write-RedLn "Invalid argument '$SetupMode' for command '$Command'."
    Write-DimLn "Use: .\dispatch-dev.ps1 setup full"
    exit 1
}

switch ($Command) {
    "setup"   { Invoke-Setup -Mode $SetupMode }
    "dev"     { Invoke-Dev }
    "start"   { Invoke-Start }
    "build"   { Invoke-Build }
    "update"  { Invoke-Update }
    "seed"    { Invoke-Seed }
    "studio"  { Invoke-Studio }
    "test"    { Invoke-Test }
    "lint"    { Invoke-Lint }
    "publish" { Invoke-Publish }
    "resetdb" { Invoke-ResetDb }
    "version" { Write-Host "Dispatch v$Version" }
    "help"    { Show-Help }
    default   { Show-Help }
}
