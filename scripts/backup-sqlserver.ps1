[CmdletBinding()]
param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backendRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing environment file: $envFile"
}

$settings = @{}
foreach ($rawLine in Get-Content -LiteralPath $envFile) {
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { continue }
  $parts = $line.Split('=', 2)
  $settings[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
}

function Get-RequiredSetting([string]$name) {
  $value = $settings[$name]
  if (-not $value) { throw "$name is required in .env" }
  return $value
}

$database = Get-RequiredSetting 'SQLSERVER_DATABASE'
$serverHost = Get-RequiredSetting 'SQLSERVER_HOST'
$serverPort = if ($settings['SQLSERVER_PORT']) { $settings['SQLSERVER_PORT'] } else { '1433' }
$isLocal = $serverHost -in @('127.0.0.1', 'localhost', '.', '(local)')
$serverEndpoint = if ($isLocal -and $serverPort -eq '1433') { '.' } else { "$serverHost,$serverPort" }

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $backendRoot 'Backups\SQLServer'
}
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null

$sqlcmd = Get-Command 'sqlcmd.exe' -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
  $knownPaths = @(
    'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE',
    'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE'
  )
  $sqlcmdPath = $knownPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $sqlcmdPath) { throw 'sqlcmd.exe was not found. Install Microsoft SQL Server command-line utilities.' }
} else {
  $sqlcmdPath = $sqlcmd.Source
}

if ($isLocal) {
  $service = Get-CimInstance Win32_Service -Filter "Name='MSSQLSERVER'" -ErrorAction SilentlyContinue
  if (-not $service) { throw 'The local MSSQLSERVER service was not found.' }
  & icacls.exe $resolvedOutputDirectory /grant "$($service.StartName):(OI)(CI)M" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not grant the SQL Server service access to $resolvedOutputDirectory" }
}

$timestamp = Get-Date -Format 'yyyyMMddTHHmmss'
$safeDatabaseName = $database -replace '[^a-zA-Z0-9_.-]', '_'
$backupPath = Join-Path $resolvedOutputDirectory "${safeDatabaseName}_${timestamp}.bak"
$databaseIdentifier = '[' + $database.Replace(']', ']]') + ']'
$sqlBackupPath = $backupPath.Replace("'", "''")

$authenticationArgs = @('-E')
if (-not $isLocal) {
  $sqlUser = Get-RequiredSetting 'SQLSERVER_USER'
  $env:SQLCMDPASSWORD = Get-RequiredSetting 'SQLSERVER_PASSWORD'
  $authenticationArgs = @('-U', $sqlUser)
}

try {
  $backupQuery = "BACKUP DATABASE $databaseIdentifier TO DISK = N'$sqlBackupPath' WITH COPY_ONLY, INIT, COMPRESSION, CHECKSUM, STATS = 10;"
  & $sqlcmdPath -S $serverEndpoint @authenticationArgs -C -b -d master -Q $backupQuery
  if ($LASTEXITCODE -ne 0) { throw "SQL Server backup failed with exit code $LASTEXITCODE" }

  $verifyQuery = "RESTORE VERIFYONLY FROM DISK = N'$sqlBackupPath' WITH CHECKSUM;"
  & $sqlcmdPath -S $serverEndpoint @authenticationArgs -C -b -d master -Q $verifyQuery
  if ($LASTEXITCODE -ne 0) { throw "SQL Server backup verification failed with exit code $LASTEXITCODE" }

  $file = Get-Item -LiteralPath $backupPath
  $stream = [System.IO.File]::OpenRead($backupPath)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha256.ComputeHash($stream)
    $hash = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
  } finally {
    if ($sha256) { $sha256.Dispose() }
    $stream.Dispose()
  }
  [ordered]@{
    database = $database
    backupPath = $file.FullName
    bytes = $file.Length
    sha256 = $hash
    verified = $true
    createdAt = $file.LastWriteTime.ToString('o')
  } | ConvertTo-Json
} finally {
  Remove-Item Env:SQLCMDPASSWORD -ErrorAction SilentlyContinue
}
