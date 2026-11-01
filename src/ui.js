(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SEVN = { error: 'ошибка', warn: 'предупр.', info: 'сведения' };
  var SEVO = { error: 0, warn: 1, info: 2 };
  var files = [], cur = null, models = null, open = {};

  // ---------- тема ----------
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); $('theme').textContent = t === 'dark' ? 'Светлая тема' : 'Тёмная тема'; try { localStorage.setItem('dtr-theme', t); } catch (e) {} }
  try { setTheme(localStorage.getItem('dtr-theme') || 'light'); } catch (e) { setTheme('light'); }
  $('theme').onclick = function () { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };

  // ---------- утилиты ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function csvCell(v) { v = String(v == null ? '' : v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csv(rows) { return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n') + '\r\n'; }
  function download(name, text, mime) {
    var b = new Blob([text], { type: mime || 'application/octet-stream' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function split(name) { var m = /^(.*?)(\.[^.]+)?$/.exec(name); return { base: m[1], ext: (m[2] || '.libxml') }; }
  function ser(doc) { var s = DX.serialize(doc); return s.charCodeAt(0) === 0xFEFF ? s : '\uFEFF' + s; }
  function saveDoc(f, doc, suffix) { var p = split(f.name); download(p.base + suffix + p.ext, ser(doc), 'application/xml'); }
  function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function enabledDefault() { var en = {}; for (var k in DC.CODES) en[k] = DC.CODES[k][1] === true && DC.DEFAULT_ON[k] !== false; return en; }
  function modelOpt() { return models && (models.my || models.main) ? { models: models } : {}; }

  // ---------- загрузка ----------
  var drop = $('drop'), fin = $('fin');
  drop.onclick = function (e) { if (e.target !== fin) fin.click(); };
  fin.onchange = function () { load(fin.files); fin.value = ''; };
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { load(e.dataTransfer.files); });

  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf), txt, enc = 'UTF-8';
      try { txt = new TextDecoder('utf-8', { fatal: true }).decode(u8); }
      catch (e) { txt = new TextDecoder('windows-1251').decode(u8); enc = 'не UTF-8 (прочитан как Windows-1251)'; }
      if (txt.charCodeAt(0) !== 0xFEFF && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) txt = '\uFEFF' + txt;
      return { txt: txt, enc: enc, size: buf.byteLength };
    });
  }
  function load(list) {
    var arr = Array.prototype.slice.call(list || []);
    if (!arr.length) return;
    drop.textContent = 'Чтение…';
    var p = Promise.resolve();
    arr.forEach(function (file) {
      p = p.then(function () { return readFile(file); }).then(function (r) {
        var f = { name: file.name, size: r.size, enc: r.enc, src: r.txt };
        var t0 = performance.now();
        try { f.doc = DX.parse(r.txt); } catch (e) { f.err = 'Не удалось разобрать: ' + e.message; }
        if (f.doc) {
          try {
            var out = ser(f.doc), srcB = r.txt.charCodeAt(0) === 0xFEFF ? r.txt : '\uFEFF' + r.txt;
            f.rt = out === srcB;
            if (!f.rt) { var i = 0, n = Math.min(out.length, srcB.length); while (i < n && out[i] === srcB[i]) i++; f.rtAt = srcB.slice(0, i).split('\n').length; }
          } catch (e) { f.rt = false; }
          f.stats = DC.stats(f.doc);
          f.iss = DC.check(f.doc, modelOpt());
          f.en = enabledDefault();
        }
        f.ms = Math.round(performance.now() - t0);
        delete f.src;
        var ix = files.findIndex(function (x) { return x.name === f.name; });
        if (ix >= 0) files[ix] = f; else files.push(f);
        cur = f;
      }).catch(function (e) { files.push({ name: file.name, err: String(e) }); });
    });
    p.then(function () {
      drop.innerHTML = 'Перетащите сюда .libxml / .elixml (можно несколько) или нажмите для выбора';
      drop.appendChild(fin);
      renderFiles(); select(cur);
    });
  }
  function counts(iss) { var c = { error: 0, warn: 0, info: 0 }; (iss || []).forEach(function (q) { var s = (DC.CODES[q.code] || ['info'])[0]; c[s]++; }); return c; }

  function renderFiles() {
    $('filesBox').classList.remove('hidden');
    $('filesT').innerHTML = files.map(function (f, i) {
      if (f.err) return '<tr data-i="' + i + '"><td>' + esc(f.name) + '</td><td colspan="7"><span class="b error">' + esc(f.err) + '</span></td></tr>';
      var c = counts(f.iss), s = f.stats;
      return '<tr data-i="' + i + '" class="' + (f === cur ? 'sel' : '') + '"><td>' + esc(f.name) + '</td><td>' + (s.kind === 'l' ? 'корпуса' : s.kind === 'e' ? 'компоненты' : '?') + '</td><td class="num">' + s.patterns + '</td><td class="num">' + (s.kind === 'e' ? s.components : '—') + '</td>' +
        '<td class="num">' + (c.error ? '<span class="b error">' + c.error + '</span>' : '0') + '</td><td class="num">' + (c.warn ? '<span class="b warn">' + c.warn + '</span>' : '0') + '</td><td class="num">' + c.info + '</td>' +
        '<td>' + (f.rt ? '<span class="b ok">побайтно совпадает</span>' : '<span class="b warn">отличается' + (f.rtAt ? ' (с ' + f.rtAt + ' стр.)' : '') + '</span>') + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call($('filesT').rows, function (tr) { tr.onclick = function () { var f = files[+tr.dataset.i]; if (!f.err) { select(f); renderFiles(); } }; });
  }

  function select(f) {
    cur = f; open = {};
    var show = !!(f && f.doc);
    ['secInfo', 'secDiag', 'secFix', 'secBis'].forEach(function (id) { $(id).classList.toggle('hidden', !show); });
    if (!show) return;
    $('fixRes').innerHTML = cur.fixed ? '<p class="small mute">Для этого файла исправленная копия уже создавалась в этом сеансе.</p>' : '';
    $('bisBase').value = cur.fixed ? 'fixed' : 'orig';
    $('bisBase').querySelector('option[value=fixed]').disabled = !cur.fixed;
    renderInfo(); renderDiag(); renderFix(); render3d(); bisInit(); renderAbl(); renderMan();
  }

  // ---------- сведения ----------
  function renderInfo() {
    var f = cur, s = f.stats, d = f.doc, c = counts(f.iss);
    var nl = d.nl === '\r\n' ? 'CRLF' : d.nl === '\n' ? 'LF' : esc(JSON.stringify(d.nl));
    $('info').innerHTML = [
      ['Файл', esc(f.name) + ' · ' + fmtN(f.size) + ' байт'],
      ['Тип', esc(s.type) + ' · версия ' + esc(s.version || '—')],
      ['Name', esc(s.name)],
      ['Единицы', esc(s.units)],
      ['Кодировка', esc(f.enc) + (d.bom ? ', с BOM' : ', без BOM') + ', строки ' + nl],
      ['Корпусов', s.patterns + ' (площадок ' + fmtN(s.pads) + ', фигур ' + fmtN(s.shapes) + ', с 3D-моделью ' + s.models + ')'],
      ['Стилей площадок', s.styles],
      s.kind === 'e' ? ['Компонентов', s.components] : null,
      ['Разбор и проверка', f.ms + ' мс']
    ].filter(Boolean).map(function (r) { return '<b>' + r[0] + '</b><span>' + r[1] + '</span>'; }).join('');
    var v;
    if (c.error) v = '<div class="note warn"><div class="bigstate">Найдены ошибки: ' + c.error + '</div>Наиболее вероятные причины зависания — ошибки структуры и ссылок. Отметьте исправления в разделе 3 и сохраните исправленную копию.</div>';
    else if (c.warn) v = '<div class="note"><div class="bigstate">Ошибок нет, предупреждений: ' + c.warn + '</div>Файл формально корректен. Предупреждения — отклонения от спецификации, которые DipTrace обычно терпит, но они могут быть причиной. Если после исправления зависание остаётся — раздел 5.</div>';
    else v = '<div class="note"><div class="bigstate">Формальных ошибок не найдено</div>Причина, вероятно, в конкретном объекте или вне файла. Используйте раздел 5 и справку внизу.</div>';
    v += '<p class="small mute">' + (f.rt ? 'Сохранение без правок даёт побайтно тот же файл — инструмент ничего не теряет при записи.' : 'Сохранение без правок отличается от исходного файла: это ожидаемо, если файл повреждён или записан не DipTrace (отступы, LF, порядок).') + '</p>';
    $('verdict').innerHTML = v;
  }

  // ---------- 3D ----------
  var IDX_JS = 'dt-models3d-index.js', idxInfo = null;
  function normRel(r) { return String(r).replace(/\//g, '\\').replace(/^\\+/, '').toLowerCase(); }
  function normPre(p) { p = String(p || '').trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase(); return p ? p + '\\' : ''; }
  function fieldPre(key) { return normPre($(key === 'my' ? 'preMy' : 'preMain').value); }
  ['preMy', 'preMain'].forEach(function (id) {
    try { var sv = localStorage.getItem('dtr-' + id); if (sv) $(id).value = sv; } catch (e) {}
    $(id).onchange = function () { try { localStorage.setItem('dtr-' + id, $(id).value); } catch (e) {} };
  });
  function recheckAll() {
    files.forEach(function (f) { if (f.doc) f.iss = DC.check(f.doc, modelOpt()); });
    if (files.length) renderFiles();
    if (cur && cur.doc) { renderInfo(); renderDiag(); }
    render3d();
  }
  function applyIndex(X) {
    models = models || {};
    (X.roots || []).forEach(function (r) {
      if (!r || !r.key) return;
      if (!r.exists) { delete models[r.key]; return; }
      var set = new Set(), cloud = new Set();
      (r.files || []).forEach(function (f) { var k = normRel(f[0]); set.add(k); if (f[1]) cloud.add(k); });
      var pre = [normPre(r.path)], fp = fieldPre(r.key); if (fp && pre.indexOf(fp) < 0) pre.push(fp);
      models[r.key] = { prefixes: pre, set: set, cloud: cloud, src: 'index', path: r.path, n: set.size, nc: cloud.size };
    });
    idxInfo = X;
  }
  function loadIndex(cb) {
    var old = document.getElementById('idxScript'); if (old) old.remove();
    try { delete window.DT_MODELS3D; } catch (e) { window.DT_MODELS3D = undefined; }
    var sc = document.createElement('script'); sc.id = 'idxScript'; sc.charset = 'utf-8';
    sc.src = IDX_JS + '?t=' + Date.now();
    sc.onload = function () { if (window.DT_MODELS3D) { applyIndex(window.DT_MODELS3D); cb(true); } else cb(false, 'файл прочитан, но не содержит данных'); };
    sc.onerror = function () { cb(false); };
    document.head.appendChild(sc);
  }
  function fmtDate(s) { var d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function stateLine() {
    var h = [];
    if (idxInfo) {
      var age = (Date.now() - new Date(idxInfo.created)) / 864e5;
      h.push('Список файлов от ' + esc(fmtDate(idxInfo.created)) + (idxInfo.host ? ', компьютер ' + esc(idxInfo.host) : '') + (age > 7 ? ' <span class="b warn">старше недели — запустите сценарий снова</span>' : ''));
      (idxInfo.roots || []).forEach(function (r) {
        var nm = r.key === 'my' ? 'свои' : 'DipTrace';
        h.push(r.exists ? nm + ': <code>' + esc(r.path) + '</code> — ' + fmtN((r.files || []).length) + ' файлов' + (models[r.key] && models[r.key].nc ? ', только в облаке ' + fmtN(models[r.key].nc) : '') : nm + ': <span class="b warn">папка не найдена</span> <code>' + esc(r.path) + '</code>');
      });
    }
    ['my', 'main'].forEach(function (k) { if (models && models[k] && models[k].src === 'pick') h.push((k === 'my' ? 'свои' : 'DipTrace') + ': выбрано вручную, ' + fmtN(models[k].n) + ' файлов'); });
    return h.join(' · ');
  }
  var m3rep = null;
  function render3d() {
    $('m3State').innerHTML = stateLine() || '<span class="mute">Список файлов моделей не найден — откройте «Настройка автоматической проверки».</span>';
    if (!cur || !cur.doc) { $('m3Rep').innerHTML = models ? '' : ''; $('m3Csv').disabled = true; return; }
    if (!models || !(models.my || models.main)) { $('m3Rep').innerHTML = ''; $('m3Csv').disabled = true; return; }
    var R = m3rep = DC.modelReport(cur.doc, models);
    $('m3Csv').disabled = !R.total;
    var SN = { ok: ['ok', 'найдена'], missing: ['error', 'нет файла'], cloud: ['warn', 'только в облаке'], unknown: ['info', 'вне указанных папок'] };
    var h = '<div class="row small"><span>Ссылок на 3D-модели: <b>' + R.total + '</b></span>' +
      '<span class="b ok">найдено ' + R.ok + '</span>' + (R.missing ? '<span class="b error">нет файла ' + R.missing + '</span>' : '') +
      (R.cloud ? '<span class="b warn">только в облаке ' + R.cloud + '</span>' : '') + (R.unknown ? '<span class="b info">вне указанных папок ' + R.unknown + '</span>' : '') + '</div>';
    var bad = R.list.filter(function (x) { return x.state !== 'ok'; });
    if (bad.length) h += '<div class="tw det-in" style="max-height:260px;margin-top:6px"><table><thead><tr><th>Корпус</th><th>Состояние</th><th>Ссылка</th></tr></thead><tbody>' +
      bad.map(function (x) { return '<tr><td class="small">#' + x.i + ' «' + esc(x.name) + '»</td><td><span class="b ' + SN[x.state][0] + '">' + SN[x.state][1] + '</span></td><td class="mono small">' + esc(x.ref) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    else if (R.total) h += '<p class="small">Все файлы 3D-моделей на месте и хранятся на этом компьютере.</p>';
    if (R.cloud) h += '<div class="note warn small">Файлы «только в облаке» DipTrace при открытии библиотеки будет ждать из OneDrive. В Проводнике: папка моделей → правая кнопка → «Всегда хранить на этом устройстве», затем запустите сценарий снова.</div>';
    $('m3Rep').innerHTML = h;
  }
  $('m3Check').onclick = function () {
    $('m3State').textContent = 'Чтение списка файлов…';
    loadIndex(function (ok, why) {
      if (!ok) {
        $('m3Setup').open = true;
        recheckAll();
        $('m3State').innerHTML = '<span class="b warn">' + (why ? esc(IDX_JS + ': ' + why) : 'Рядом с инструментом нет ' + IDX_JS) + '</span> Скачайте сценарий ниже, положите его в папку с этим HTML и запустите.' + (stateLine() ? ' · ' + stateLine() : '');
        return;
      }
      recheckAll();
    });
  };
  $('m3Csv').onclick = function () {
    if (!m3rep) return;
    var SN = { ok: 'найдена', missing: 'нет файла', cloud: 'только в облаке', unknown: 'вне указанных папок' };
    var rows = [['Файл', '№', 'Корпус', 'Состояние', 'Ссылка', 'Папка']];
    m3rep.list.forEach(function (x) { rows.push([cur.name, x.i, x.name, SN[x.state], x.ref, x.root === 'my' ? '%my3dmodels%' : x.root === 'main' ? '%maindir%\\models3d' : '']); });
    download(split(cur.name).base + '.3d.csv', csv(rows), 'text/csv');
  };
  function b64(s) { var u = new TextEncoder().encode(s), b = ''; for (var i = 0; i < u.length; i++) b += String.fromCharCode(u[i]); return btoa(b); }
  function makeCmd(my, main) {
    return [
      '<# : DipTrace 3D models index (batch + PowerShell)',
      '@echo off',
      'setlocal',
      'set "DTR_DIR=%~dp0"',
      'set "DTR_SELF=%~f0"',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:DTR_SELF))"',
      'pause',
      'exit /b',
      '#>',
      '# Пишет рядом с собой dt-models3d-index.js — список файлов папок 3D-моделей для «Ремонт библиотек DipTrace XML».',
      '# Файлы не открываются и из OneDrive не скачиваются: читаются только имена и атрибуты.',
      '$ErrorActionPreference = "SilentlyContinue"',
      'function D($b) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }',
      'function J($s) { \'"\' + (($s -replace \'\\\\\', \'\\\\\') -replace \'"\', \'\\"\') + \'"\' }',
      '$roots = @(',
      '  @{ key = "my";   cands = @((D "' + b64(my) + '"), "$env:OneDrive\\DipTrace\\models3d", "$env:USERPROFILE\\OneDrive\\DipTrace\\models3d", "$env:USERPROFILE\\Documents\\DipTrace\\models3d") },',
      '  @{ key = "main"; cands = @((D "' + b64(main) + '"), "C:\\DipTrace\\models3d", "$env:ProgramFiles\\DipTrace\\models3d", "${env:ProgramFiles(x86)}\\DipTrace\\models3d") }',
      ')',
      '$dir = $env:DTR_DIR; if (-not $dir) { $dir = (Get-Location).Path }',
      '$out = Join-Path $dir "dt-models3d-index.js"',
      '$sb = New-Object Text.StringBuilder',
      '[void]$sb.Append(\'window.DT_MODELS3D={"created":\' + (J (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")) + \',"host":\' + (J $env:COMPUTERNAME) + \',"roots":[\')',
      '$first = $true',
      'foreach ($r in $roots) {',
      '  if (-not $first) { [void]$sb.Append(",") }; $first = $false',
      '  $p = $r.cands | Where-Object { $_ -match \'^([A-Za-z]:[\\\\/]|\\\\\\\\|/)\' -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -First 1',
      '  if (-not $p) {',
      '    [void]$sb.Append(\'{"key":"\' + $r.key + \'","path":\' + (J $r.cands[0]) + \',"exists":false,"files":[]}\')',
      '    Write-Host ("[{0}] папка не найдена: {1}" -f $r.key, $r.cands[0]); continue',
      '  }',
      '  $p = (Get-Item -LiteralPath $p).FullName.TrimEnd("\\", "/")',
      '  Write-Host ("[{0}] {1} ..." -f $r.key, $p)',
      '  [void]$sb.Append(\'{"key":"\' + $r.key + \'","path":\' + (J $p) + \',"exists":true,"files":[\')',
      '  $n = 0; $c = 0',
      '  Get-ChildItem -LiteralPath $p -Recurse -File -Force | ForEach-Object {',
      '    $rel = $_.FullName.Substring($p.Length + 1)',
      '    $cl = 0; if (([int64]$_.Attributes -band 0x441000) -ne 0) { $cl = 1 }',
      '    if ($n -gt 0) { [void]$sb.Append(",") }',
      '    [void]$sb.Append("[" + (J $rel) + "," + $cl + "]"); $n++; $c += $cl',
      '  }',
      '  [void]$sb.Append("]}")',
      '  Write-Host ("      файлов: {0}, только в облаке: {1}" -f $n, $c)',
      '}',
      '[void]$sb.Append("]};")',
      '[IO.File]::WriteAllText($out, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))',
      'Write-Host ("Готово: " + $out)',
      'Write-Host "Теперь нажмите в инструменте кнопку «Проверить 3D-модели»."',
      ''
    ].join('\r\n');
  }
  $('m3Cmd').onclick = function () { download('dt-models3d-index.cmd', makeCmd($('preMy').value.trim(), $('preMain').value.trim()), 'application/octet-stream'); };
  window.__makeCmd = makeCmd;
  function bindDir(btn, input, cnt, key) {
    $(btn).onclick = function () { $(input).click(); };
    $(input).onchange = function () {
      var set = new Set();
      Array.prototype.forEach.call(this.files, function (fl) { var rp = (fl.webkitRelativePath || fl.name).split('/').slice(1).join('\\'); if (rp) set.add(normRel(rp)); });
      models = models || {};
      models[key] = { prefixes: [fieldPre(key)], set: set, src: 'pick', n: set.size };
      $(cnt).textContent = 'файлов: ' + fmtN(set.size);
      recheckAll();
    };
  }
  bindDir('pickMy', 'dirMy', 'cntMy', 'my');
  bindDir('pickMain', 'dirMain', 'cntMain', 'main');
  loadIndex(function (ok) { if (ok) recheckAll(); else $('m3State').innerHTML = '<span class="mute">Список файлов моделей не найден — откройте «Настройка автоматической проверки».</span>'; });

  // ---------- диагностика ----------
  function groups() {
    var g = {};
    cur.iss.forEach(function (q) { (g[q.code] = g[q.code] || []).push(q); });
    return Object.keys(g).map(function (k) { return { code: k, list: g[k], meta: DC.CODES[k] || ['info', false, k] }; })
      .sort(function (a, b) { return SEVO[a.meta[0]] - SEVO[b.meta[0]] || b.list.length - a.list.length; });
  }
  function renderDiag() {
    var sev = {}; Array.prototype.forEach.call(document.querySelectorAll('.sevf'), function (c) { sev[c.value] = c.checked; });
    var q = $('q').value.trim().toLowerCase();
    var G = groups(), html = '';
    if (!G.length) html = '<tr><td colspan="6" class="mute">Замечаний нет.</td></tr>';
    G.forEach(function (g) {
      if (!sev[g.meta[0]]) return;
      var list = q ? g.list.filter(function (x) { return (x.obj + ' ' + x.msg + ' ' + g.code + ' ' + g.meta[2]).toLowerCase().indexOf(q) >= 0; }) : g.list;
      if (q && !list.length) return;
      var fx = g.meta[1] === 'auto' ? '<span class="small mute">всегда</span>' : g.meta[1] === true ? '<input type="checkbox" data-c="' + g.code + '"' + (cur.en[g.code] ? ' checked' : '') + '>' : '<span class="small mute">—</span>';
      html += '<tr class="grp" data-g="' + g.code + '"><td>' + fx + '</td><td><span class="b ' + g.meta[0] + '">' + SEVN[g.meta[0]] + '</span></td><td class="mono">' + g.code + '</td><td>' + esc(g.meta[2]) + '</td><td class="num">' + list.length + '</td><td class="small">' + esc(list[0].obj) + '</td></tr>';
      if (open[g.code]) {
        var lim = list.slice(0, 1000);
        html += '<tr class="det"><td colspan="6"><div class="det-in"><table>' + lim.map(function (x) { return '<tr><td class="small" style="width:30%">' + esc(x.obj) + '</td><td class="num small" style="width:70px">' + (x.ln ? 'стр. ' + x.ln : '') + '</td><td class="small">' + esc(x.msg) + '</td></tr>'; }).join('') + (list.length > lim.length ? '<tr><td colspan="3" class="mute small">… ещё ' + (list.length - lim.length) + ' (полный список — в отчёте CSV)</td></tr>' : '') + '</table></div></td></tr>';
      }
    });
    $('diagT').innerHTML = html;
    Array.prototype.forEach.call($('diagT').querySelectorAll('tr.grp'), function (tr) {
      tr.onclick = function (e) { if (e.target.tagName === 'INPUT') return; open[tr.dataset.g] = !open[tr.dataset.g]; renderDiag(); };
    });
    Array.prototype.forEach.call($('diagT').querySelectorAll('input[data-c]'), function (cb) { cb.onchange = function () { cur.en[cb.dataset.c] = cb.checked; renderFix(); }; });
    renderFix();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.sevf'), function (c) { c.onchange = renderDiag; });
  $('q').oninput = renderDiag;
  $('selRec').onclick = function () { cur.en = enabledDefault(); renderDiag(); };
  $('selNone').onclick = function () { for (var k in cur.en) cur.en[k] = false; renderDiag(); };
  $('csvIss').onclick = function () {
    var rows = [['Файл', 'Уровень', 'Код', 'Проблема', 'Объект', 'Строка', 'Подробно', 'Исправляется']];
    cur.iss.forEach(function (x) { var m = DC.CODES[x.code] || ['info', false, x.code]; rows.push([cur.name, SEVN[m[0]], x.code, m[2], x.obj, x.ln || '', x.msg, m[1] === 'auto' ? 'всегда' : m[1] ? (cur.en[x.code] ? 'да' : 'нет (не отмечено)') : 'нет']); });
    download(split(cur.name).base + '.diag.csv', csv(rows), 'text/csv');
  };

  // ---------- исправление ----------
  function renderFix() {
    var n = 0, act = 0; cur.iss.forEach(function (x) { var m = DC.CODES[x.code]; if (!m) return; if (m[1] === 'auto') act++; else if (m[1] === true && cur.en[x.code]) n++; });
    $('doFix').textContent = 'Исправить отмеченное (' + n + (act ? ' + ' + act + ' при разборе' : '') + ') и скачать';
    $('csvLog').disabled = !cur.log;
  }
  $('doFix').onclick = function () {
    var f = cur, d = { root: DX.clone(f.doc.root), decl: f.doc.decl, nl: '\r\n', bom: true, issues: [] };
    var name0 = DX.at(d.root, 'Name'), uid0 = DX.at(d.root, 'UID32');
    var log = DC.apply(d, f.en, modelOpt());
    if ($('keepName').checked) { if (name0 != null) DX.setA(d.root, 'Name', name0); if (uid0 != null) DX.setA(d.root, 'UID32', uid0); }
    var out = ser(d), d2 = DX.parse(out), left = DC.check(d2, modelOpt()), c = counts(left);
    var autoN = f.iss.filter(function (x) { return (DC.CODES[x.code] || [])[1] === 'auto'; });
    f.log = autoN.map(function (x) { return { pass: 0, code: x.code, obj: x.obj, ln: x.ln, msg: x.msg }; }).concat(log);
    f.fixed = d2;
    saveDoc(f, d2, '.fixed');
    var by = {}; f.log.forEach(function (x) { by[x.code] = (by[x.code] || 0) + 1; });
    $('fixRes').innerHTML = '<p>Скачан <b>' + esc(split(f.name).base + '.fixed' + split(f.name).ext) + '</b>. Исправлений: ' + f.log.length + '. ' +
      Object.keys(by).map(function (k) { return '<span class="pill"><span class="mono">' + k + '</span> ' + by[k] + '</span>'; }).join('') + '</p>' +
      '<p>Повторная проверка результата: ошибок ' + c.error + ', предупреждений ' + c.warn + ', сведений ' + c.info + '.' + (c.error ? ' Оставшиеся ошибки автоматически не исправляются — смотрите раздел 3.' : '') + '</p>';
    renderFix(); $('bisBase').querySelector('option[value=fixed]').disabled = false; $('bisBase').value = 'fixed'; bisInit(); renderMan();
  };
  $('csvLog').onclick = function () {
    var rows = [['Проход', 'Код', 'Проблема', 'Объект', 'Строка исходника', 'Что сделано']];
    (cur.log || []).forEach(function (x) { rows.push([x.pass === 0 ? 'разбор' : x.pass, x.code, (DC.CODES[x.code] || [, , ''])[2], x.obj, x.ln || '', x.msg]); });
    download(split(cur.name).base + '.fixlog.csv', csv(rows), 'text/csv');
  };

  // ---------- поиск деления ----------
  var B = null;
  function baseDoc() { return $('bisBase').value === 'fixed' && cur.fixed ? cur.fixed : cur.doc; }
  function bisInit() {
    var isE = cur.stats.kind === 'e';
    $('bisMode').querySelector('option[value=comp]').disabled = !isE;
    if (!isE) $('bisMode').value = 'pat';
    var all = DC.items(baseDoc(), $('bisMode').value);
    B = { mode: $('bisMode').value, all: all, cand: all.map(function (x) { return x.i; }), hist: [], later: [], step: 0, done: null };
    renderBis();
  }
  $('bisStart').onclick = bisInit; $('bisMode').onchange = function () { bisInit(); renderMan(); }; $('bisBase').onchange = function () { bisInit(); renderMan(); };
  function halves() { var n = B.cand.length, h = Math.ceil(n / 2); return [B.cand.slice(0, h), B.cand.slice(h)]; }
  function nm(i) { var it = B.all[i]; return it ? it.name : '#' + i; }
  function unit() { return B.mode === 'pat' ? 'корпусов' : 'компонентов'; }
  function renderBis() {
    var h = '', n = B.cand.length;
    if (!n) { $('bisBox').innerHTML = '<p class="mute">Нет объектов для деления.</p>'; return; }
    if (B.done) {
      h += '<div class="note warn"><div class="bigstate">' + esc(B.done) + '</div></div>';
    } else if (n === 1) {
      var i = B.cand[0], label = (B.mode === 'pat' ? 'Корпус #' : 'Компонент #') + i + ' «' + nm(i) + '»';
      var own = cur.iss.filter(function (x) { return x.obj.indexOf('#' + i + ' «') >= 0; });
      h += '<div class="note warn"><div class="bigstate">Причина: ' + esc(label) + '</div>' +
        (own.length ? 'Замечания по нему: ' + own.map(function (x) { return '<div class="small"><span class="mono">' + x.code + '</span> ' + esc(x.msg) + '</div>'; }).join('') : 'Формальных замечаний по нему нет — проверьте варианты ниже на файле «только он» или отправьте его в поддержку DipTrace.') + '</div>' +
        '<div class="row"><button class="pri" id="bWithout">Скачать библиотеку без него</button><button id="bOnly">Скачать только его</button>' + (B.hist.length ? '<button id="bBack">Шаг назад</button>' : '') + '</div>';
      if (B.later.length) h += '<p class="small">Отложено для проверки (вариант «обе зависают»): ' + B.later.map(function (g) { return g.length + ' ' + unit(); }).join(', ') + ' <button id="bLater">Проверить отложенное</button></p>';
    } else {
      var H = halves(), steps = Math.ceil(Math.log2(n));
      h += '<p>Шаг ' + (B.step + 1) + '. Осталось ' + n + ' ' + unit() + ', ещё примерно ' + steps + ' шаг(ов). ' +
        'Скачайте обе части, откройте каждую в DipTrace (' + (cur.stats.kind === 'l' ? 'Pattern Editor' : 'Component Editor') + ' → File → Open / Import) и отметьте результат.</p>' +
        '<div class="row"><button id="bA">Скачать часть A (' + H[0].length + ')</button><button id="bB">Скачать часть B (' + H[1].length + ')</button></div>' +
        '<p class="small mute">A: ' + esc(H[0].slice(0, 6).map(nm).join(', ')) + (H[0].length > 6 ? '…' : '') + '<br>B: ' + esc(H[1].slice(0, 6).map(nm).join(', ')) + (H[1].length > 6 ? '…' : '') + '</p>' +
        '<div class="row"><button class="pri" id="vA">Зависает A</button><button class="pri" id="vB">Зависает B</button><button id="vOk">Обе открываются</button><button id="vBoth">Обе зависают</button>' + (B.hist.length ? '<button id="bBack">Шаг назад</button>' : '') + '</div>';
    }
    $('bisBox').innerHTML = h;
    var tag = function (s) { return '[тест ' + s + ']'; };
    var on = function (id, fn) { var e = $(id); if (e) e.onclick = fn; };
    on('bA', function () { var H = halves(); saveDoc(cur, DC.subset(baseDoc(), B.mode, H[0], tag((B.step + 1) + 'A')), '.step' + (B.step + 1) + 'A'); });
    on('bB', function () { var H = halves(); saveDoc(cur, DC.subset(baseDoc(), B.mode, H[1], tag((B.step + 1) + 'B')), '.step' + (B.step + 1) + 'B'); });
    function push() { B.hist.push({ cand: B.cand.slice(), later: B.later.slice(), step: B.step, done: B.done }); }
    on('vA', function () { push(); B.cand = halves()[0]; B.step++; renderBis(); });
    on('vB', function () { push(); B.cand = halves()[1]; B.step++; renderBis(); });
    on('vBoth', function () { push(); var H = halves(); B.later.push(H[1]); B.cand = H[0]; B.step++; renderBis(); });
    on('vOk', function () { push(); B.done = 'Обе части открываются, а целиком — нет. Причина не в одном объекте: либо сочетание объектов из разных половин (например, одинаковые стили/имена), либо общий объём/внешние ссылки. Проверьте варианты «без …» ниже и справку внизу. «Шаг назад» вернёт предыдущее состояние.'; renderBis(); });
    on('bBack', function () { var s = B.hist.pop(); B.cand = s.cand; B.later = s.later; B.step = s.step; B.done = s.done; renderBis(); });
    on('bLater', function () { push(); B.cand = B.later.shift(); renderBis(); });
    on('bWithout', function () { var keep = B.all.map(function (x) { return x.i; }).filter(function (i) { return i !== B.cand[0]; }); saveDoc(cur, DC.subset(baseDoc(), B.mode, keep, null), '.without_' + safe(nm(B.cand[0]))); });
    on('bOnly', function () { saveDoc(cur, DC.subset(baseDoc(), B.mode, [B.cand[0]], tag(nm(B.cand[0]))), '.only_' + safe(nm(B.cand[0]))); });
  }
  function safe(s) { return String(s || 'obj').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40); }

  // ---------- варианты «без …» ----------
  function renderAbl() {
    $('ablBox').innerHTML = DC.ABL.map(function (a) { return '<button data-k="' + a.k + '">' + esc(a.t) + '</button>'; }).join('') + '<button data-k="*">всё сразу</button>';
    Array.prototype.forEach.call($('ablBox').querySelectorAll('button'), function (b) {
      b.onclick = function () { var k = b.dataset.k, keys = k === '*' ? DC.ABL.map(function (a) { return a.k; }) : [k]; saveDoc(cur, DC.ablate(baseDoc(), keys, '[тест ' + k.replace('*', 'all') + ']'), '.' + (k === '*' ? 'all' : k)); };
    });
  }

  // ---------- ручной выбор ----------
  var man = {};
  function renderMan() {
    var mode = $('bisMode').value, all = DC.items(baseDoc(), mode), q = $('manQ').value.trim().toLowerCase();
    man = {};
    $('manList').innerHTML = all.map(function (x) { return '<label data-n="' + esc((x.name || '').toLowerCase()) + '"><input type="checkbox" value="' + x.i + '"><span class="mono">#' + x.i + '</span> ' + esc(x.name) + '</label>'; }).join('');
    filterMan(); $('manCnt').textContent = '';
  }
  function filterMan() { var q = $('manQ').value.trim().toLowerCase(); Array.prototype.forEach.call($('manList').children, function (l) { l.classList.toggle('hidden', !!q && l.dataset.n.indexOf(q) < 0); }); }
  function picked() { return Array.prototype.filter.call($('manList').querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return +c.value; }); }
  $('manQ').oninput = filterMan;
  $('manList').onchange = function () { $('manCnt').textContent = 'отмечено: ' + picked().length; };
  $('manAll').onclick = function () { Array.prototype.forEach.call($('manList').children, function (l) { if (!l.classList.contains('hidden')) l.firstChild.checked = true; }); $('manList').onchange(); };
  $('manNone').onclick = function () { Array.prototype.forEach.call($('manList').querySelectorAll('input'), function (c) { c.checked = false; }); $('manList').onchange(); };
  $('manOnly').onclick = function () { var p = picked(); if (!p.length) return; saveDoc(cur, DC.subset(baseDoc(), $('bisMode').value, p, '[выбор ' + p.length + ']'), '.pick' + p.length); };
  $('manWithout').onclick = function () { var p = picked(); if (!p.length) return; var s = {}; p.forEach(function (i) { s[i] = 1; }); var keep = DC.items(baseDoc(), $('bisMode').value).map(function (x) { return x.i; }).filter(function (i) { return !s[i]; }); saveDoc(cur, DC.subset(baseDoc(), $('bisMode').value, keep, null), '.without' + p.length); };
})();
