<# : DipTrace 3D models index (batch + PowerShell)
@echo off
setlocal
set "DTR_DIR=%~dp0"
set "DTR_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:DTR_SELF))"
pause
exit /b
#>
# Пишет рядом с собой dt-models3d-index.js — список файлов папок 3D-моделей для «Ремонт библиотек DipTrace XML».
# Файлы не открываются и из OneDrive не скачиваются: читаются только имена и атрибуты.
$ErrorActionPreference = "SilentlyContinue"
function D($b) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }
function J($s) { '"' + (($s -replace '\\', '\\') -replace '"', '\"') + '"' }
$roots = @(
  @{ key = "my";   cands = @((D "QzpcVXNlcnNcbGltYXJcT25lRHJpdmVcRGlwVHJhY2VcbW9kZWxzM2Q="), "$env:OneDrive\DipTrace\models3d", "$env:USERPROFILE\OneDrive\DipTrace\models3d", "$env:USERPROFILE\Documents\DipTrace\models3d") },
  @{ key = "main"; cands = @((D "QzpcUHJvZ3JhbSBGaWxlc1xEaXBUcmFjZVxtb2RlbHMzZA=="), "C:\DipTrace\models3d", "$env:ProgramFiles\DipTrace\models3d", "${env:ProgramFiles(x86)}\DipTrace\models3d") }
)
$dir = $env:DTR_DIR; if (-not $dir) { $dir = (Get-Location).Path }
$out = Join-Path $dir "dt-models3d-index.js"
$sb = New-Object Text.StringBuilder
[void]$sb.Append('window.DT_MODELS3D={"created":' + (J (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")) + ',"host":' + (J $env:COMPUTERNAME) + ',"roots":[')
$first = $true
foreach ($r in $roots) {
  if (-not $first) { [void]$sb.Append(",") }; $first = $false
  $p = $r.cands | Where-Object { $_ -match '^([A-Za-z]:[\\/]|\\\\|/)' -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -First 1
  if (-not $p) {
    [void]$sb.Append('{"key":"' + $r.key + '","path":' + (J $r.cands[0]) + ',"exists":false,"files":[]}')
    Write-Host ("[{0}] папка не найдена: {1}" -f $r.key, $r.cands[0]); continue
  }
  $p = (Get-Item -LiteralPath $p).FullName.TrimEnd("\", "/")
  Write-Host ("[{0}] {1} ..." -f $r.key, $p)
  [void]$sb.Append('{"key":"' + $r.key + '","path":' + (J $p) + ',"exists":true,"files":[')
  $n = 0; $c = 0
  Get-ChildItem -LiteralPath $p -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($p.Length + 1)
    $cl = 0; if (([int64]$_.Attributes -band 0x441000) -ne 0) { $cl = 1 }
    if ($n -gt 0) { [void]$sb.Append(",") }
    [void]$sb.Append("[" + (J $rel) + "," + $cl + "]"); $n++; $c += $cl
  }
  [void]$sb.Append("]}")
  Write-Host ("      файлов: {0}, только в облаке: {1}" -f $n, $c)
}
[void]$sb.Append("]};")
[IO.File]::WriteAllText($out, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
Write-Host ("Готово: " + $out)
Write-Host "Теперь нажмите в инструменте кнопку «Проверить 3D-модели»."
