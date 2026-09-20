$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ""
Write-Host "AGENTE PUXADA - INSTALACAO" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ nao foi encontrado. Instale o Node.js LTS neste computador antes de continuar."
}

$nodeVersion = node -p "process.versions.node"
Write-Host "Node.js: $nodeVersion"

if (-not (Test-Path ".\config.json")) {
  Copy-Item ".\config.example.json" ".\config.json"
  Write-Host "config.json criado."
}

Write-Host ""
$token = Read-Host "Cole o token do Agente Puxada gerado em ADM"
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Token nao informado."
}

$secure = ConvertTo-SecureString $token -AsPlainText -Force
$encrypted = ConvertFrom-SecureString $secure
Set-Content -LiteralPath ".\agent-token.dat" -Value $encrypted -Encoding UTF8
Write-Host "Token salvo com protecao DPAPI do Windows." -ForegroundColor Green

Write-Host ""
Write-Host "Instalando dependencias..."
npm install --omit=dev

$taskName = "Agente Puxada Promax"
$cmd = Join-Path $root "run-agent.cmd"
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument ("/c `"" + $cmd + "`"") -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Sincroniza o Promax 02.05.01 com o Painel Armazem." -Force | Out-Null

Write-Host ""
Write-Host "Tarefa '$taskName' criada para iniciar junto com o Windows." -ForegroundColor Green
Write-Host "Proximo passo: execute .\calibrar.ps1" -ForegroundColor Yellow
