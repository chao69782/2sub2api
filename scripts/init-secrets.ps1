param(
  [Parameter(Mandatory = $true)][string]$AdminPassword,
  [Parameter(Mandatory = $true)][string]$Sub2APIAdminKey
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SecretsDirectory = Join-Path $ProjectRoot 'secrets'
New-Item -ItemType Directory -Force -Path $SecretsDirectory | Out-Null

function New-RandomBase64([int]$ByteCount) {
  $Bytes = New-Object byte[] $ByteCount
  [Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
  return [Convert]::ToBase64String($Bytes)
}

Set-Content -LiteralPath (Join-Path $SecretsDirectory 'workbench_admin_password.txt') -Value $AdminPassword -NoNewline
Set-Content -LiteralPath (Join-Path $SecretsDirectory 'sub2api_admin_key.txt') -Value $Sub2APIAdminKey -NoNewline
Set-Content -LiteralPath (Join-Path $SecretsDirectory 'app_master_key.txt') -Value (New-RandomBase64 32) -NoNewline
Set-Content -LiteralPath (Join-Path $SecretsDirectory 'app_session_secret.txt') -Value (New-RandomBase64 48) -NoNewline

$ConfigTarget = Join-Path $ProjectRoot 'config.yaml'
if (-not (Test-Path -LiteralPath $ConfigTarget)) {
  Copy-Item -LiteralPath (Join-Path $ProjectRoot 'config.docker.example.yaml') -Destination $ConfigTarget
}

Write-Host '配置和密钥文件已创建。请检查 config.yaml 中的 Sub2API 地址，然后按照 DEPLOYMENT.md 使用 docker run 启动。'
