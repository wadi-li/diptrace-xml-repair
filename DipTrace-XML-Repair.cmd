<# : DipTrace XML Repair - local server
@echo off
setlocal
set "DTR_DIR=%~dp0"
set "DTR_SELF=%~f0"
title DipTrace XML Repair - local server
powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:DTR_SELF))"
if errorlevel 1 pause
exit /b
#>
# DipTrace XML Repair — локальный сервер (Windows PowerShell 5.1+, без установки).
# Слушает только 127.0.0.1:<порт> (TcpListener, без прав администратора), принимает запросы только со своей страницы (токен + проверка Host/Origin).
$ErrorActionPreference = 'Stop'
$DTR_VERSION = '2.0'
# Test-Path без исключений: «Отказано в доступе» = «нет».
function TP([string]$LiteralPath, [string]$PathType = 'Any') { if (-not $LiteralPath) { return $false }; try { Test-Path -LiteralPath $LiteralPath -PathType $PathType -ErrorAction Stop } catch { $false } }
$dir = $env:DTR_DIR; if (-not $dir) { $dir = (Get-Location).Path }
$htmlPath = Join-Path $dir 'diptrace-xml-repair.html'
if (-not (TP $htmlPath)) { Write-Host "Не найден $htmlPath — положите сценарий рядом с diptrace-xml-repair.html"; exit 1 }
$isWin = ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT)
if ($env:APPDATA) { $cfgDir = Join-Path $env:APPDATA 'dt-xml-repair' } else { $cfgDir = Join-Path $HOME '.dt-xml-repair' }
$cfgFile = Join-Path $cfgDir 'config.json'
$token = [guid]::NewGuid().ToString('N')
$dtData = $env:DTR_DTDATA; if (-not $dtData) { $dtData = 'C:\ProgramData\DipTrace\Data_Unicode' }
$XML_EXT = @('.libxml', '.elixml', '.xml')
$OUT_EXT = @('.libxml', '.elixml', '.xml', '.csv', '.txt')

# ---------- JSON ----------
$J_CTRL = New-Object Text.RegularExpressions.Regex '[\x00-\x1f]'
function J($s) {
  if ($null -eq $s) { return 'null' }
  $t = ([string]$s).Replace('\', '\\').Replace('"', '\"')
  if ($J_CTRL.IsMatch($t)) { $t = $J_CTRL.Replace($t, { param($m) '\u' + ([int][char]$m.Value).ToString('x4') }) }
  '"' + $t + '"'
}
function JV($v) {
  if ($null -eq $v) { return 'null' }
  if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
  if ($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [int64]) { return ([string]$v).Replace(',', '.') }
  if ($v -is [string]) { return (J $v) }
  if ($v -is [datetime]) { return (J $v.ToString('yyyy-MM-ddTHH:mm:ss')) }
  if ($v -is [System.Collections.IDictionary]) { $p = @(); foreach ($k in $v.Keys) { $p += (J ([string]$k)) + ':' + (JV $v[$k]) }; return '{' + ($p -join ',') + '}' }
  if ($v -is [System.Collections.IEnumerable]) { $p = @(); foreach ($x in $v) { $p += (JV $x) }; return '[' + ($p -join ',') + ']' }
  if ($v -is [psobject]) { $p = @(); foreach ($pr in $v.PSObject.Properties) { $p += (J $pr.Name) + ':' + (JV $pr.Value) }; return '{' + ($p -join ',') + '}' }
  return (J ([string]$v))
}
function FromJ([string]$s) { if (-not $s) { return $null }; return ($s | ConvertFrom-Json) }

# ---------- настройки ----------
function Load-Config {
  $c = [ordered]@{ libDirs = @(); recurse = $true; my3d = ''; main3d = '' }
  if (TP $cfgFile) {
    try { $o = FromJ ([IO.File]::ReadAllText($cfgFile, [Text.Encoding]::UTF8))
      if ($o.libDirs) { $c.libDirs = @($o.libDirs) }; if ($null -ne $o.recurse) { $c.recurse = [bool]$o.recurse }
      if ($o.my3d) { $c.my3d = [string]$o.my3d }; if ($o.main3d) { $c.main3d = [string]$o.main3d } } catch { }
  }
  $c
}
function Save-Config($o) {
  $c = [ordered]@{ libDirs = @($o.libDirs | Where-Object { $_ } | ForEach-Object { [string]$_ }); recurse = [bool]$o.recurse; my3d = [string]$o.my3d; main3d = [string]$o.main3d }
  if (-not (TP $cfgDir)) { [void](New-Item -ItemType Directory -Path $cfgDir -Force) }
  [IO.File]::WriteAllText($cfgFile, (JV $c), (New-Object Text.UTF8Encoding($false)))
  $c
}

# ---------- DipTrace ----------
function Get-DT {
  $inst = @()
  if ($isWin) {
    $keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    $inst = @(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*DipTrace*' } | ForEach-Object {
      [ordered]@{ name = [string]$_.DisplayName; version = [string]$_.DisplayVersion; location = ([string]$_.InstallLocation).Trim('"', ' ').TrimEnd('\') } })
  }
  $main = ''
  foreach ($i in $inst) { if ($i.name -eq 'DipTrace' -and $i.location) { $main = $i.location } }
  if (-not $main) { foreach ($p in @('C:\DipTrace', "$env:ProgramFiles\DipTrace", "${env:ProgramFiles(x86)}\DipTrace")) { try { if ($p -and (TP (Join-Path $p 'Schematic.exe'))) { $main = $p; break } } catch {} } }
  [ordered]@{ installs = $inst; maindir = $main; dataDir = $dtData; dataExists = (TP $dtData); procs = @(Get-DTProcs) }
}
function Get-DTProcs {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(Schematic|Pcb|CompEdit|PattEdit|Launcher|DipTrace)$' } | ForEach-Object { $_.ProcessName + '.exe' } | Sort-Object -Unique)
}

# ---------- файлы ----------
function Ext($p) { [IO.Path]::GetExtension($p).ToLowerInvariant() }
function IsCloud($fi) { (([int64]$fi.Attributes) -band 0x441000) -ne 0 }
function List-Libs($dirs, $recurse) {
  $res = @()
  foreach ($d in $dirs) {
    $d = [string]$d
    if (-not $d -or -not (TP $d -PathType Container)) { $res += [ordered]@{ dir = $d; exists = $false; files = @() }; continue }
    $gp = @{ LiteralPath = $d; File = $true; Force = $true; ErrorAction = 'SilentlyContinue' }; if ($recurse) { $gp.Recurse = $true }
    $fs = @(Get-ChildItem @gp | Where-Object { $XML_EXT -contains $_.Extension.ToLowerInvariant() -and $_.Name -notmatch '\.(fixed|bak-\d{8}-\d{6}|step\d+[AB]|only_.*|without.*|pick\d+|no3d|nofields|nocat|norc|free|notext|nodim|nometa|mount|all)\.(libxml|elixml)$' -and $_.FullName -notmatch '\\dtr-test\\' } | Select-Object -First 3000)
    $res += [ordered]@{ dir = $d; exists = $true; files = @($fs | ForEach-Object { [ordered]@{ path = $_.FullName; size = [int64]$_.Length; mtime = $_.LastWriteTime; cloud = (IsCloud $_) } }) }
  }
  $res
}
# Быстрый обход .NET (без конвейера и вызовов функций на каждый файл): ~10 тыс. файлов за 1–2 с.
function Scan-Models($cands) {
  foreach ($p in $cands) {
    $p = [string]$p
    if (-not (TP $p -PathType Container)) { continue }
    try { $root = New-Object IO.DirectoryInfo $p; $base = $root.FullName.TrimEnd('\', '/') } catch { continue }
    $bl = $base.Length + 1; $sb = New-Object Text.StringBuilder; $first = $true
    $st = New-Object Collections.Stack; $st.Push(@($root, 0))
    while ($st.Count) {
      $it = $st.Pop(); $di = $it[0]; $dp = $it[1]
      try { $fis = $di.GetFileSystemInfos() } catch { continue }
      foreach ($f in $fis) {
        $a = [int64]$f.Attributes
        if ($a -band 16) { if ($dp -lt 40) { $st.Push(@($f, ($dp + 1))) }; continue }
        if ($first) { $first = $false } else { [void]$sb.Append(',') }
        [void]$sb.Append('["').Append($f.FullName.Substring($bl).Replace('\', '\\').Replace('"', '\"')).Append('",').Append([int](($a -band 0x441000) -ne 0)).Append(']')
      }
    }
    return '{"path":' + (J $base) + ',"exists":true,"files":[' + $sb.ToString() + ']}'
  }
  $first = ''; foreach ($p in $cands) { if ($p) { $first = [string]$p; break } }
  '{"path":' + (J $first) + ',"exists":false,"files":[]}'
}
function DT-DataFiles {
  $files = @(); $baks = @{}
  if (TP $dtData) {
    foreach ($n in @('libgroups.dat', 'libgroups_var.dat', 'otherlibs.dat')) {
      $p = Join-Path $dtData $n
      if (TP $p) { $fi = Get-Item -LiteralPath $p; $files += [ordered]@{ name = $n; size = [int64]$fi.Length; mtime = $fi.LastWriteTime; b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p)) } }
    }
    Get-ChildItem -LiteralPath $dtData -Filter 'libgroups*.dat.dtr-bak-*' -ErrorAction SilentlyContinue | ForEach-Object {
      $ts = $_.Name.Substring($_.Name.LastIndexOf('-bak-') + 5); if (-not $baks.ContainsKey($ts)) { $baks[$ts] = @() }; $baks[$ts] += $_.Name }
  }
  [ordered]@{ dir = $dtData; exists = (TP $dtData); files = $files; backups = @($baks.Keys | Sort-Object -Descending | ForEach-Object { [ordered]@{ ts = $_; files = $baks[$_] } }) }
}

# ---------- выбор папок/файлов окном Windows ----------
function Pick($kind, $start) {
  if (-not $isWin) { throw 'Окно выбора доступно только в Windows' }
  Add-Type -AssemblyName System.Windows.Forms
  $owner = New-Object Windows.Forms.Form; $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.StartPosition = 'CenterScreen'; $owner.Width = 1; $owner.Height = 1; $owner.Opacity = 0
  $owner.Show(); $owner.Activate()
  try {
    if ($kind -eq 'dir') {
      $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = 'Папка с библиотеками DipTrace (.libxml / .elixml)'; $d.ShowNewFolderButton = $false
      if ($start -and (TP $start)) { $d.SelectedPath = $start }
      if ($d.ShowDialog($owner) -eq 'OK') { return @($d.SelectedPath) }
    } else {
      $d = New-Object Windows.Forms.OpenFileDialog; $d.Multiselect = $true; $d.Title = 'Библиотеки DipTrace XML'
      $d.Filter = 'Библиотеки DipTrace XML (*.libxml;*.elixml)|*.libxml;*.elixml|XML (*.xml)|*.xml|Все файлы (*.*)|*.*'
      if ($start -and (TP $start)) { $d.InitialDirectory = $start }
      if ($d.ShowDialog($owner) -eq 'OK') { return @($d.FileNames) }
    }
  } finally { $owner.Close(); $owner.Dispose() }
  @()
}

# ---------- HTTP ----------
$REASON = @{ 200 = 'OK'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 409 = 'Conflict'; 500 = 'Internal Server Error' }
function Send($ctx, [int]$code, [string]$type, [byte[]]$bytes) {
  if ($ctx.Sent) { return }
  if ($null -eq $bytes) { $bytes = [byte[]]@() }
  # Transfer-Encoding: chunked, а не Content-Length: фильтры трафика (AdGuard и т. п.) встраивают скрипт в HTML,
  # не меняя Content-Length, и страница обрезается. С chunked они пересчитывают поток корректно.
  $h = "HTTP/1.1 $code " + $REASON[$code] + "`r`nContent-Type: $type`r`nTransfer-Encoding: chunked`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n"
  foreach ($k in $ctx.RespHeaders.Keys) { $h += "${k}: " + $ctx.RespHeaders[$k] + "`r`n" }
  $hb = [Text.Encoding]::ASCII.GetBytes($h + "`r`n")
  $ctx.Stream.Write($hb, 0, $hb.Length)
  if ($bytes.Length) { $ch = [Text.Encoding]::ASCII.GetBytes($bytes.Length.ToString('x') + "`r`n"); $ctx.Stream.Write($ch, 0, $ch.Length); $ctx.Stream.Write($bytes, 0, $bytes.Length); $ctx.Stream.Write([byte[]](13, 10), 0, 2) }
  $end = [Text.Encoding]::ASCII.GetBytes("0`r`n`r`n"); $ctx.Stream.Write($end, 0, $end.Length); $ctx.Stream.Flush(); $ctx.Sent = $true
}
# Минимальный HTTP/1.1 поверх TcpListener (без http.sys: не нужны права администратора и URL ACL).
# Аккуратное закрытие: FIN, дочитать остаток запроса, затем Close (иначе Close с непрочитанными данными шлёт RST).
function Close-Client($client) {
  try {
    $sock = $client.Client; $sock.Shutdown([Net.Sockets.SocketShutdown]::Send)
    $buf = New-Object byte[] 4096; $t = [Diagnostics.Stopwatch]::StartNew()
    while ($t.ElapsedMilliseconds -lt 1500 -and $sock.Poll(200000, [Net.Sockets.SelectMode]::SelectRead)) { if ($sock.Available -le 0) { break }; [void]$sock.Receive($buf) }
  } catch { }
  try { $client.Close() } catch { }
}
function Read-Request($client) {
  $client.ReceiveTimeout = 30000; $client.SendTimeout = 30000
  $ns = $client.GetStream(); $hb = New-Object IO.MemoryStream; $one = New-Object byte[] 1
  while ($true) {
    if ($ns.Read($one, 0, 1) -le 0) { return $null }
    $hb.WriteByte($one[0]); $n = $hb.Length
    if ($n -ge 4) { $a = $hb.GetBuffer(); if ($a[$n - 1] -eq 10 -and $a[$n - 2] -eq 13 -and $a[$n - 3] -eq 10 -and $a[$n - 4] -eq 13) { break } }
    if ($n -gt 65536) { return $null }
  }
  $lines = [Text.Encoding]::ASCII.GetString($hb.ToArray()).Split(@("`r`n"), [StringSplitOptions]::None)
  $rl = $lines[0].Split(' '); if ($rl.Count -lt 3) { return $null }
  $hd = @{}
  for ($i = 1; $i -lt $lines.Count; $i++) { $ln = $lines[$i]; $c = $ln.IndexOf(':'); if ($c -gt 0) { $hd[$ln.Substring(0, $c).Trim()] = $ln.Substring($c + 1).Trim() } }
  $body = New-Object IO.MemoryStream
  $len = 0; if ($hd['Content-Length']) { $len = [int64]$hd['Content-Length'] }
  if ($len -gt 200MB) { return $null }
  if ($len -gt 0) { $buf = New-Object byte[] 65536; $left = $len; while ($left -gt 0) { $r = $ns.Read($buf, 0, [int][Math]::Min($buf.Length, $left)); if ($r -le 0) { break }; $body.Write($buf, 0, $r); $left -= $r }; $body.Position = 0 }
  [pscustomobject]@{ Request = [pscustomobject]@{ HttpMethod = $rl[0]; RawUrl = $rl[1]; Headers = $hd; InputStream = $body }; Stream = $ns; RespHeaders = @{}; Sent = $false }
}
function SendJ($ctx, [int]$code, [string]$json) { Send $ctx $code 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) }
function Err($ctx, [int]$code, [string]$msg) { SendJ $ctx $code ('{"error":' + (J $msg) + '}') }
function Query($ctx) {
  $h = @{}; $raw = $ctx.Request.RawUrl; $i = $raw.IndexOf('?')
  if ($i -ge 0) { foreach ($kv in $raw.Substring($i + 1).Split('&')) { if (-not $kv) { continue }; $p = $kv.Split(@('='), 2, [StringSplitOptions]::None)
      $v = ''; if ($p.Count -gt 1) { $v = [Uri]::UnescapeDataString($p[1].Replace('+', ' ')) }; $h[[Uri]::UnescapeDataString($p[0])] = $v } }
  $h
}
function BodyBytes($ctx) { $ms = New-Object IO.MemoryStream; $ctx.Request.InputStream.CopyTo($ms); , $ms.ToArray() }
function BodyJ($ctx) { FromJ ([Text.Encoding]::UTF8.GetString((BodyBytes $ctx))) }

function Handle($ctx) {
  $req = $ctx.Request; $raw = $req.RawUrl; $path = $raw; $qi = $raw.IndexOf('?'); if ($qi -ge 0) { $path = $raw.Substring(0, $qi) }
  $hostH = [string]$req.Headers['Host']
  if (@("localhost:$port", "127.0.0.1:$port") -notcontains $hostH) { Err $ctx 403 'bad host'; return }
  $origin = [string]$req.Headers['Origin']
  if ($origin -and @("http://localhost:$port", "http://127.0.0.1:$port") -notcontains $origin) { Err $ctx 403 'bad origin'; return }
  if ($req.HttpMethod -eq 'GET' -and ($path -eq '/' -or $path -eq '/index.html' -or $path -eq '/diptrace-xml-repair.html')) {
    $html = [IO.File]::ReadAllText($htmlPath, [Text.Encoding]::UTF8)
    $inj = 'window.DTR_SERVER={token:"' + $token + '",port:' + $port + ',version:"' + $DTR_VERSION + '"};'
    $html = $html.Replace('/*__DTR_SERVER__*/', $inj)
    Send $ctx 200 'text/html; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($html)); return
  }
  if (-not $path.StartsWith('/api/')) { Err $ctx 404 'not found'; return }
  if ([string]$req.Headers['X-DTR-Token'] -ne $token) { Err $ctx 403 'bad token'; return }
  $q = Query $ctx
  switch ($path) {
    '/api/info' { SendJ $ctx 200 (JV ([ordered]@{ version = $DTR_VERSION; port = $port; computer = [Environment]::MachineName; user = [Environment]::UserName; html = $htmlPath; cfgFile = $cfgFile; config = (Load-Config); dt = (Get-DT); windows = $isWin })) }
    '/api/procs' { SendJ $ctx 200 (JV ([ordered]@{ procs = @(Get-DTProcs) })) }
    '/api/config' { $o = BodyJ $ctx; SendJ $ctx 200 (JV (Save-Config $o)) }
    '/api/pick' { $o = BodyJ $ctx; SendJ $ctx 200 (JV ([ordered]@{ paths = @(Pick ([string]$o.kind) ([string]$o.start)) })) }
    '/api/list' { $o = BodyJ $ctx; SendJ $ctx 200 (JV ([ordered]@{ dirs = @(List-Libs @($o.dirs) ([bool]$o.recurse)) })) }
    '/api/stat' {
      $o = BodyJ $ctx
      SendJ $ctx 200 (JV ([ordered]@{ files = @(@($o.paths) | ForEach-Object { $p = [string]$_; $r = [ordered]@{ path = $p; exists = $false }
            try { if (TP $p -PathType Leaf) { $fi = New-Object IO.FileInfo $p; $r = [ordered]@{ path = $fi.FullName; exists = $true; size = [int64]$fi.Length; mtime = $fi.LastWriteTime; cloud = (IsCloud $fi) } } } catch { $r['error'] = $_.Exception.Message }
            $r }) }))
    }
    '/api/read' {
      $p = [string]$q['path']
      if ($XML_EXT -notcontains (Ext $p)) { Err $ctx 400 'Разрешено читать только .libxml, .elixml, .xml'; return }
      if (-not (TP $p -PathType Leaf)) { Err $ctx 404 ('Файл не найден: ' + $p); return }
      $fi = Get-Item -LiteralPath $p
      $ctx.RespHeaders['X-DTR-Mtime'] = $fi.LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss')
      Send $ctx 200 'application/octet-stream' ([IO.File]::ReadAllBytes($fi.FullName))
    }
    '/api/write' {
      $p = [string]$q['path']; $mode = [string]$q['mode']; if (-not $mode) { $mode = 'new' }
      if ($OUT_EXT -notcontains (Ext $p)) { Err $ctx 400 'Недопустимое расширение'; return }
      if (-not [IO.Path]::IsPathRooted($p)) { Err $ctx 400 'Нужен полный путь'; return }
      $bytes = BodyBytes $ctx
      $parent = [IO.Path]::GetDirectoryName($p)
      if (-not (TP $parent)) { if ($q['mkdir'] -eq '1') { [void](New-Item -ItemType Directory -Path $parent -Force) } else { Err $ctx 400 ('Нет папки: ' + $parent); return } }
      $backup = $null
      if (TP $p) {
        if ($mode -eq 'new') { SendJ $ctx 409 ('{"exists":true,"path":' + (J $p) + '}'); return }
        if ($mode -eq 'replace') {
          $b = [IO.Path]::Combine($parent, [IO.Path]::GetFileNameWithoutExtension($p) + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + [IO.Path]::GetExtension($p))
          Copy-Item -LiteralPath $p -Destination $b; $backup = $b
        }
      }
      [IO.File]::WriteAllBytes($p, $bytes)
      SendJ $ctx 200 (JV ([ordered]@{ path = $p; backup = $backup; size = $bytes.Length; procs = @(Get-DTProcs) }))
    }
    '/api/models' {
      $o = BodyJ $ctx
      SendJ $ctx 200 ('{"created":' + (J (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')) + ',"host":' + (J ([Environment]::MachineName)) + ',"roots":[' +
        '{"key":"my",' + (Scan-Models @($o.my)).Substring(1) + ',' + '{"key":"main",' + (Scan-Models @($o.main)).Substring(1) + ']}')
    }
    '/api/dtdata' { SendJ $ctx 200 (JV (DT-DataFiles)) }
    '/api/dtdata/reset' {
      $pr = @(Get-DTProcs); if ($pr.Count) { Err $ctx 409 ('Закройте DipTrace: ' + ($pr -join ', ')); return }
      $ts = Get-Date -Format 'yyyyMMdd-HHmmss'; $done = @()
      foreach ($n in @('libgroups.dat', 'libgroups_var.dat')) { $p = Join-Path $dtData $n; if (TP $p) { Rename-Item -LiteralPath $p -NewName ($n + '.dtr-bak-' + $ts); $done += $n } }
      SendJ $ctx 200 (JV ([ordered]@{ ts = $ts; renamed = $done }))
    }
    '/api/dtdata/restore' {
      $o = BodyJ $ctx; $ts = [string]$o.ts
      if ($ts -notmatch '^\d{8}-\d{6}$') { Err $ctx 400 'bad ts'; return }
      $pr = @(Get-DTProcs); if ($pr.Count) { Err $ctx 409 ('Закройте DipTrace: ' + ($pr -join ', ')); return }
      $now = Get-Date -Format 'yyyyMMdd-HHmmss'; $done = @()
      foreach ($n in @('libgroups.dat', 'libgroups_var.dat')) {
        $b = Join-Path $dtData ($n + '.dtr-bak-' + $ts); $p = Join-Path $dtData $n
        if (TP $b) { if (TP $p) { Rename-Item -LiteralPath $p -NewName ($n + '.dtr-new-' + $now) }; Rename-Item -LiteralPath $b -NewName $n; $done += $n }
      }
      SendJ $ctx 200 (JV ([ordered]@{ restored = $done }))
    }
    '/api/reveal' {
      $o = BodyJ $ctx; $p = [string]$o.path
      if ($isWin -and $p -and (TP $p)) { Start-Process explorer.exe -ArgumentList ('/select,"' + $p + '"') }
      SendJ $ctx 200 '{"ok":true}'
    }
    '/api/shutdown' { SendJ $ctx 200 '{"ok":true}'; $script:stop = $true }
    default { Err $ctx 404 'unknown api' }
  }
}

# ---------- запуск ----------
$L = $null; $port = 0
$p0 = 8765; if ($env:DTR_PORT) { $p0 = [int]$env:DTR_PORT }
foreach ($p in $p0..($p0 + 15)) {
  try { $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p); $l.ExclusiveAddressUse = $true; $l.Start(); $L = $l; $port = $p; break } catch { }
}
if (-not $L) { Write-Host 'Не удалось открыть порт 8765–8780 на 127.0.0.1'; exit 1 }
$url = "http://127.0.0.1:$port/"
Write-Host "Ремонт библиотек DipTrace XML $DTR_VERSION — локальный сервер"
Write-Host "Адрес: $url   (только этот компьютер)"
Write-Host 'Закройте это окно или нажмите «Остановить сервер» в инструменте, чтобы завершить.'
if ($isWin -and $env:DTR_NOBROWSER -ne '1') { Start-Process $url }
if ($env:DTR_READY) { [IO.File]::WriteAllText($env:DTR_READY, [string]$port) }
$script:stop = $false; $DBG = ($env:DTR_DEBUG -eq '1')
try {
  while (-not $script:stop) {
    if (-not $L.Pending()) { Start-Sleep -Milliseconds 40; continue }
    $client = $L.AcceptTcpClient(); $ctx = $null; if ($DBG) { Write-Host ('accept ' + $client.Client.RemoteEndPoint) }
    try {
      $ctx = Read-Request $client
      if ($DBG) { if ($ctx) { Write-Host ('req ' + $ctx.Request.HttpMethod + ' ' + $ctx.Request.RawUrl) } else { Write-Host 'req: пусто' } }
      if ($ctx) { Handle $ctx }
      if ($DBG) { Write-Host 'sent' }
    } catch {
      if ($ctx) { try { Err $ctx 500 $_.Exception.Message } catch { } }
      Write-Host ('Ошибка: ' + $_.Exception.Message)
    } finally { Close-Client $client }
  }
} finally { $L.Stop() }
Write-Host 'Сервер остановлен.'
