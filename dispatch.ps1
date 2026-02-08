<#
.SYNOPSIS
    Dispatch production launcher.

.DESCRIPTION
    Docker-only commands for running Dispatch without npm.
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("setup", "start", "stop", "restart", "logs", "status", "down", "pull", "help", "version", "")]
    [string]$Command = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptRoot = $PSScriptRoot
$EnvFilePath = Join-Path $ScriptRoot ".env.prod"

$PackageJson = Get-Content -Raw -Path (Join-Path $ScriptRoot "package.json") | ConvertFrom-Json
$Version = $PackageJson.version

function Write-CyanLn { param([string]$Text) Write-Host $Text -ForegroundColor Cyan }
function Write-DimLn { param([string]$Text) Write-Host $Text -ForegroundColor DarkGray }
function Write-GreenLn { param([string]$Text) Write-Host $Text -ForegroundColor Green }
function Write-YellowLn { param([string]$Text) Write-Host $Text -ForegroundColor Yellow }
function Write-RedLn { param([string]$Text) Write-Host $Text -ForegroundColor Red }

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
    Write-DimLn "  v$Version - Docker production launcher"
    Write-Host ""
}

function Show-Help {
    Show-Logo

    Write-Host "  USAGE" -ForegroundColor White
    Write-Host "    .\\dispatch.ps1 <command>"
    Write-Host ""
    Write-Host "  COMMANDS" -ForegroundColor White
    Write-Host "    setup      Interactive production setup (.env.prod + optional start)"
    Write-Host "    start      Start Dispatch with Docker Compose (.env.prod)"
    Write-Host "    stop       Stop running Dispatch containers"
    Write-Host "    restart    Restart Dispatch containers"
    Write-Host "    logs       Follow Dispatch logs"
    Write-Host "    status     Show container status"
    Write-Host "    pull       Pull latest image and restart"
    Write-Host "    down       Stop and remove containers/network"
    Write-Host "    version    Show version number"
    Write-Host "    help       Show this help message"
    Write-Host ""
    Write-DimLn "  Production config is stored in .env.prod"
    Write-DimLn "  Developer workflow (npm build/test/dev) moved to .\\dispatch-dev.ps1"
    Write-Host ""
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-RedLn "Docker is not installed or not on PATH."
        exit 1
    }
}

function Assert-EnvFile {
    if (-not (Test-Path $EnvFilePath)) {
        Write-RedLn "Missing .env.prod. Run '.\dispatch.ps1 setup' first."
        exit 1
    }
}

function New-AuthSecret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return ([Convert]::ToBase64String($bytes)).TrimEnd("=") -replace "\+", "-" -replace "/", "_"
}

function Get-EnvMap {
    param([string]$Path)

    $map = [ordered]@{}
    if (-not (Test-Path $Path)) {
        return $map
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

        $key = $parts[0].Trim()
        $value = $parts[1]
        if ($key -match "^[A-Za-z_][A-Za-z0-9_]*$") {
            $map[$key] = $value
        }
    }

    return $map
}

function Prompt-Value {
    param(
        [string]$Message,
        [string]$Default = "",
        [bool]$AllowEmpty = $false
    )

    while ($true) {
        $prompt = if ($Default) { "$Message (default: $Default)" } else { $Message }
        $value = Read-Host $prompt

        if ([string]::IsNullOrWhiteSpace($value)) {
            if ($Default) {
                return $Default
            }
            if ($AllowEmpty) {
                return ""
            }
            Write-YellowLn "Value is required."
            continue
        }

        return $value.Trim()
    }
}

function Prompt-Port {
    param([string]$Default = "3000")

    while ($true) {
        $raw = Prompt-Value -Message "Port to run Dispatch on" -Default $Default
        $portNumber = 0
        if (-not [int]::TryParse($raw, [ref]$portNumber)) {
            Write-YellowLn "Port must be a number."
            continue
        }
        if ($portNumber -lt 1 -or $portNumber -gt 65535) {
            Write-YellowLn "Port must be between 1 and 65535."
            continue
        }
        return [string]$portNumber
    }
}

function Prompt-YesNo {
    param(
        [string]$Message,
        [bool]$Default = $true
    )

    while ($true) {
        $defaultLabel = if ($Default) { "Y" } else { "N" }
        $raw = Read-Host "$Message [y/n] (default: $defaultLabel)"
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $Default
        }

        switch ($raw.Trim().ToLowerInvariant()) {
            "y" { return $true }
            "yes" { return $true }
            "n" { return $false }
            "no" { return $false }
            default {
                Write-YellowLn "Enter y or n."
            }
        }
    }
}

function Write-ProdEnvFile {
    param([hashtable]$Map)

    $lines = @(
        "# Production runtime",
        "AUTH_SECRET=$($Map.AUTH_SECRET)",
        "NEXTAUTH_URL=$($Map.NEXTAUTH_URL)",
        "AUTH_TRUST_HOST=true",
        "AUTH_GITHUB_ID=$($Map.AUTH_GITHUB_ID)",
        "AUTH_GITHUB_SECRET=$($Map.AUTH_GITHUB_SECRET)",
        "DISPATCH_PORT=$($Map.DISPATCH_PORT)",
        "DISPATCH_IMAGE=$($Map.DISPATCH_IMAGE)",
        ""
    )

    Set-Content -Path $EnvFilePath -Value $lines -Encoding UTF8
}

function Run-Compose {
    param([string[]]$ComposeArgs)

    Set-Location $ScriptRoot
    docker compose --env-file .env.prod @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Invoke-Setup {
    Show-Logo
    Assert-Docker

    $existing = Get-EnvMap -Path $EnvFilePath

    $defaultPort = if ($existing.Contains("DISPATCH_PORT")) { $existing.DISPATCH_PORT } else { "3000" }
    $port = Prompt-Port -Default $defaultPort

    $defaultUrl = if ($existing.Contains("NEXTAUTH_URL")) {
        $existing.NEXTAUTH_URL
    } else {
        "http://localhost:$port"
    }
    $nextAuthUrl = Prompt-Value -Message "Public URL for Dispatch (NEXTAUTH_URL)" -Default $defaultUrl

    $defaultImage = if ($existing.Contains("DISPATCH_IMAGE") -and $existing.DISPATCH_IMAGE) {
        $existing.DISPATCH_IMAGE
    } elseif ($env:DISPATCH_IMAGE) {
        $env:DISPATCH_IMAGE
    } else {
        "ghcr.io/nkasco/dispatchtodoapp:latest"
    }
    $dispatchImage = Prompt-Value -Message "Container image to run (DISPATCH_IMAGE)" -Default $defaultImage

    $hasGitHub = ($existing.Contains("AUTH_GITHUB_ID") -and $existing.AUTH_GITHUB_ID) -and ($existing.Contains("AUTH_GITHUB_SECRET") -and $existing.AUTH_GITHUB_SECRET)
    $useGitHub = Prompt-YesNo -Message "Enable GitHub OAuth sign-in?" -Default ([bool]$hasGitHub)

    $githubId = ""
    $githubSecret = ""

    if ($useGitHub) {
        Write-Host ""
        Write-CyanLn "GitHub OAuth setup:"
        Write-DimLn "  1) Open: https://github.com/settings/developers"
        Write-DimLn "  2) OAuth callback URL: $nextAuthUrl/api/auth/callback/github"
        Write-Host ""

        $defaultGithubId = if ($existing.Contains("AUTH_GITHUB_ID")) { $existing.AUTH_GITHUB_ID } else { "" }
        $defaultGithubSecret = if ($existing.Contains("AUTH_GITHUB_SECRET")) { $existing.AUTH_GITHUB_SECRET } else { "" }
        $githubId = Prompt-Value -Message "GitHub OAuth Client ID (AUTH_GITHUB_ID)" -Default $defaultGithubId
        $githubSecret = Prompt-Value -Message "GitHub OAuth Client Secret (AUTH_GITHUB_SECRET)" -Default $defaultGithubSecret
    }

    $authSecret = if ($existing.Contains("AUTH_SECRET") -and $existing.AUTH_SECRET) { $existing.AUTH_SECRET } else { New-AuthSecret }

    $finalMap = [ordered]@{
        AUTH_SECRET        = $authSecret
        NEXTAUTH_URL       = $nextAuthUrl
        AUTH_GITHUB_ID     = $githubId
        AUTH_GITHUB_SECRET = $githubSecret
        DISPATCH_PORT      = $port
        DISPATCH_IMAGE     = $dispatchImage
    }

    Write-ProdEnvFile -Map $finalMap
    Write-GreenLn "Wrote .env.prod"
    Write-DimLn "Image: $dispatchImage"
    Write-DimLn "URL: $nextAuthUrl"
    Write-Host ""

    if (Prompt-YesNo -Message "Start Dispatch now?" -Default $true) {
        Run-Compose -ComposeArgs @("up", "-d")
        Write-GreenLn "Dispatch is running."
    }
}

function Invoke-Start {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("up", "-d")
    Write-GreenLn "Dispatch is running."
}

function Invoke-Stop {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("stop")
}

function Invoke-Restart {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("restart")
}

function Invoke-Logs {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("logs", "-f", "dispatch")
}

function Invoke-Status {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("ps")
}

function Invoke-Down {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("down")
}

function Invoke-Pull {
    Show-Logo
    Assert-Docker
    Assert-EnvFile
    Run-Compose -ComposeArgs @("pull")
    Run-Compose -ComposeArgs @("up", "-d")
}

switch ($Command) {
    "setup" { Invoke-Setup }
    "start" { Invoke-Start }
    "stop" { Invoke-Stop }
    "restart" { Invoke-Restart }
    "logs" { Invoke-Logs }
    "status" { Invoke-Status }
    "down" { Invoke-Down }
    "pull" { Invoke-Pull }
    "version" { Write-Host "Dispatch v$Version" }
    "help" { Show-Help }
    default { Show-Help }
}
