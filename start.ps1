Param(
  [Parameter(Position=0)]
  [ValidateSet('start','stop','restart','logs','clean','help')]
  [string]$Command = 'help'
)

$ErrorActionPreference = 'Stop'

function Write-ColorLine([string]$Text, [ConsoleColor]$Color) {
  $old = $Host.UI.RawUI.ForegroundColor
  try {
    $Host.UI.RawUI.ForegroundColor = $Color
    Write-Host $Text
  } finally {
    $Host.UI.RawUI.ForegroundColor = $old
  }
}

function Get-ComposeCommand {
  if (Get-Command docker-compose -ErrorAction SilentlyContinue) { return 'docker-compose' }
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
      docker compose version | Out-Null
      return 'docker compose'
    } catch {
      return $null
    }
  }
  return $null
}

function Ensure-EnvFile {
  if (-not (Test-Path -LiteralPath .env)) {
    if (Test-Path -LiteralPath .env.example) {
      Write-ColorLine "Creating .env from .env.example..." Yellow
      Copy-Item -LiteralPath .env.example -Destination .env
      Write-ColorLine "Please edit .env and add API keys (GROQ_API_KEY / OPENAI_API_KEY) if needed." Yellow
    }
  }
}

function Invoke-Compose([string[]]$ComposeArgs) {
  $compose = Get-ComposeCommand
  if (-not $compose) {
    Write-ColorLine "Docker Compose not found. Install/start Docker Desktop first." Red
    throw "Compose not found"
  }

  if ($compose -eq 'docker-compose') {
    docker-compose @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker-compose failed with exit code $LASTEXITCODE" }
    return
  }

  if ($compose -eq 'docker compose') {
    docker compose @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed with exit code $LASTEXITCODE" }
    return
  }

  throw "Unexpected compose command: $compose"
}

Write-Host "GoToMock Dev Manager (PowerShell)"

switch ($Command) {
  'start' {
    Ensure-EnvFile
    Write-ColorLine "Starting GoToMock (docker compose up --build -d)..." Green
    Invoke-Compose @('up','--build','-d')
    Write-ColorLine "Waiting for services..." Green
    Start-Sleep -Seconds 10
    Write-ColorLine "GoToMock is running:" Green
    Write-Host "  Frontend: http://localhost:5173"
    Write-Host "  Backend:  http://localhost:8000"
    Write-Host "  Docs:     http://localhost:8000/docs"
    Write-Host "  MySQL:    localhost:3307 (container 3306)"
    Write-Host "Logs:  .\\start.ps1 logs"
    Write-Host "Stop:  .\\start.ps1 stop"
  }
  'stop' {
    Write-ColorLine "Stopping GoToMock (docker compose down)..." Yellow
    Invoke-Compose @('down')
    Write-ColorLine "Stopped." Green
  }
  'restart' {
    & $PSCommandPath -Command stop
    & $PSCommandPath -Command start
  }
  'logs' {
    Invoke-Compose @('logs','-f')
  }
  'clean' {
    Write-ColorLine "Cleaning containers/images/volumes..." Yellow
    Invoke-Compose @('down','-v','--rmi','all')
    Write-ColorLine "Cleanup complete." Green
  }
  default {
    Write-Host "Usage: .\\start.ps1 {start|stop|restart|logs|clean}"
    Write-Host "  start   Start stack"
    Write-Host "  stop    Stop stack"
    Write-Host "  restart Restart stack"
    Write-Host "  logs    Follow logs"
    Write-Host "  clean   Remove containers/images/volumes"
  }
}
