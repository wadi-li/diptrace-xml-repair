window.DTR_START = function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SEVN = { error: 'ошибка', warn: 'предупр.', info: 'сведения' };
  var SEVO = { error: 0, warn: 1, info: 2 };
  var files = [], cur = null, models = null, open = {};
  var SRV = window.DTR_SERVER || null;
  function api(path, body, opt) {
    opt = opt || {};
    var init = { method: body === undefined ? 'GET' : 'POST', headers: { 'X-DTR-Token': SRV.token } };
    if (body !== undefined) { if (body instanceof Blob) init.body = body; else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; } }
    return fetch(path, init).then(function (r) {
      if (opt.bin) return r.ok ? r.arrayBuffer() : r.json().then(function (j) { throw new Error(j.error || ('HTTP ' + r.status)); });
      return r.json().then(function (j) { if (!r.ok && !opt.allow) throw new Error(j.error || ('HTTP ' + r.status)); j.__status = r.status; return j; });
    });
  }
  function toast(msg, path, isErr) {
    $('toastMsg').innerHTML = msg; $('toast').classList.remove('hidden'); $('toast').classList.toggle('err', !!isErr);
    $('toastShow').classList.toggle('hidden', !path); $('toastShow').onclick = function () { api('/api/reveal', { path: path }); };
    clearTimeout(toast.t); if (!isErr) toast.t = setTimeout(function () { $('toast').classList.add('hidden'); }, 9000);
  }
  $('toastX').onclick = function () { $('toast').classList.add('hidden'); };

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
  function dirOf(p) { return String(p).replace(/[\\\/][^\\\/]*$/, ''); }
  // Вывод: в режиме сервера — запись на диск рядом с исходником, иначе скачивание.
  function emit(f, fname, text, kind) {
    if (SRV && f && f.path) {
      var sep = f.path.indexOf('\\') >= 0 ? '\\' : '/', target = kind === 'replace' ? f.path : dirOf(f.path) + (kind === 'test' ? sep + 'dtr-test' : '') + sep + fname;
      return api('/api/write?path=' + encodeURIComponent(target) + '&mode=' + (kind === 'replace' ? 'replace' : 'overwrite') + '&mkdir=1', new Blob([text]))
        .then(function (r) {
          toast('Записано: <code>' + esc(r.path) + '</code>' + (r.backup ? '<br>Резервная копия: <code>' + esc(r.backup) + '</code>' : '') + (r.procs && r.procs.length ? '<br><span class="b warn">DipTrace запущен: ' + esc(r.procs.join(', ')) + '</span>' : ''), r.path);
          return r;
        }, function (e) { toast('Ошибка записи: ' + esc(e.message), null, true); throw e; });
    }
    download(fname, text, /\.csv$/i.test(fname) ? 'text/csv' : 'application/xml');
    return Promise.resolve(null);
  }
  function saveDoc(f, doc, suffix, kind) { var p = split(f.name); return emit(f, p.base + suffix + p.ext, ser(doc), kind || 'test'); }
  function saveCsv(f, suffix, rows) { return emit(f, split(f.name).base + suffix, csv(rows), 'csv'); }
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

  function decode(buf) {
    var u8 = new Uint8Array(buf), txt, enc = 'UTF-8';
    try { txt = new TextDecoder('utf-8', { fatal: true }).decode(u8); }
    catch (e) { txt = new TextDecoder('windows-1251').decode(u8); enc = 'не UTF-8 (прочитан как Windows-1251)'; }
    if (txt.charCodeAt(0) !== 0xFEFF && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) txt = '\uFEFF' + txt;
    return { txt: txt, enc: enc, size: buf.byteLength };
  }
  function load(list) {
    loadEntries(Array.prototype.map.call(list || [], function (file) { return { name: file.name, get: function () { return file.arrayBuffer(); } }; }));
  }
  function loadPaths(paths) {
    return loadEntries(paths.map(function (p) { return { name: p.replace(/^.*[\\\/]/, ''), path: p, get: function () { return api('/api/read?path=' + encodeURIComponent(p), undefined, { bin: true }); } }; }));
  }
  function key(f) { return (f.path || f.name).toLowerCase(); }
  function loadEntries(arr, quiet) {
    if (!arr.length) return Promise.resolve();
    var k = 0;
    var p = Promise.resolve();
    arr.forEach(function (en) {
      p = p.then(function () { k++; drop.textContent = 'Чтение ' + k + ' из ' + arr.length + ': ' + en.name + '…'; return en.get(); }).then(function (buf) {
        var r = decode(buf);
        var f = { name: en.name, path: en.path || null, size: r.size, enc: r.enc };
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
        var ix = files.findIndex(function (x) { return key(x) === key(f); });
        if (ix >= 0) files[ix] = f; else files.push(f);
        cur = f;
      }).catch(function (e) { var f = { name: en.name, path: en.path || null, err: String(e.message || e) }; var ix = files.findIndex(function (x) { return key(x) === key(f); }); if (ix >= 0) files[ix] = f; else files.push(f); });
    });
    return p.then(function () {
      drop.innerHTML = 'Перетащите сюда .libxml / .elixml (можно несколько) или нажмите для выбора';
      drop.appendChild(fin);
      renderFiles(); if (cur && !cur.err) select(cur); if (SRV) renderLibs();
    });
  }
  function counts(iss) { var c = { error: 0, warn: 0, info: 0 }; (iss || []).forEach(function (q) { var s = (DC.CODES[q.code] || ['info'])[0]; c[s]++; }); return c; }

  function renderFiles() {
    $('filesBox').classList.remove('hidden');
    $('filesT').innerHTML = files.map(function (f, i) {
      if (f.err) return '<tr data-i="' + i + '"><td>' + esc(f.name) + '</td><td colspan="7"><span class="b error">' + esc(f.err) + '</span></td></tr>';
      var c = counts(f.iss), s = f.stats;
      return '<tr data-i="' + i + '" class="' + (f === cur ? 'sel' : '') + '"><td title="' + esc(f.path || '') + '">' + esc(f.name) + (f.path ? '<div class="small mute">' + esc(dirOf(f.path)) + '</div>' : '') + '</td><td>' + (s.kind === 'l' ? 'корпуса' : s.kind === 'e' ? 'компоненты' : '?') + '</td><td class="num">' + s.patterns + '</td><td class="num">' + (s.kind === 'e' ? s.components : '—') + '</td>' +
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
    $(id).onchange = function () { try { localStorage.setItem('dtr-' + id, $(id).value); } catch (e) {} if (SRV && CFG) { CFG[id === 'preMy' ? 'my3d' : 'main3d'] = $(id).value.trim(); saveCfg(); run3d(); } };
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
    if (SRV) { run3d(); return; }
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
    saveCsv(cur, '.3d.csv', rows);
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
  if (!SRV) loadIndex(function (ok) { if (ok) recheckAll(); else $('m3State').innerHTML = '<span class="mute">Список файлов моделей не найден — откройте «Настройка автоматической проверки».</span>'; });

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
    saveCsv(cur, '.diag.csv', rows);
  };

  // ---------- исправление ----------
  function renderFix() {
    var n = 0, act = 0; cur.iss.forEach(function (x) { var m = DC.CODES[x.code]; if (!m) return; if (m[1] === 'auto') act++; else if (m[1] === true && cur.en[x.code]) n++; });
    $('doFix').textContent = 'Исправить отмеченное (' + n + (act ? ' + ' + act + ' при разборе' : '') + ') и ' + (SRV && cur.path ? 'сохранить .fixed' : 'скачать');
    $('doReplace').classList.toggle('hidden', !(SRV && cur.path));
    $('csvLog').disabled = !cur.log;
  }
  function buildFixed(f) {
    var d = { root: DX.clone(f.doc.root), decl: f.doc.decl, nl: '\r\n', bom: true, issues: [] };
    var name0 = DX.at(d.root, 'Name'), uid0 = DX.at(d.root, 'UID32');
    var log = DC.apply(d, f.en, modelOpt());
    if ($('keepName').checked) { if (name0 != null) DX.setA(d.root, 'Name', name0); if (uid0 != null) DX.setA(d.root, 'UID32', uid0); }
    var out = ser(d), d2 = DX.parse(out), left = DC.check(d2, modelOpt()), c = counts(left);
    var autoN = f.iss.filter(function (x) { return (DC.CODES[x.code] || [])[1] === 'auto'; });
    f.log = autoN.map(function (x) { return { pass: 0, code: x.code, obj: x.obj, ln: x.ln, msg: x.msg }; }).concat(log);
    f.fixed = d2;
    return { doc: d2, c: c };
  }
  function fixReport(f, R, where) {
    var by = {}; f.log.forEach(function (x) { by[x.code] = (by[x.code] || 0) + 1; });
    $('fixRes').innerHTML = '<p>' + where + ' Исправлений: ' + f.log.length + '. ' +
      Object.keys(by).map(function (k) { return '<span class="pill"><span class="mono">' + k + '</span> ' + by[k] + '</span>'; }).join('') + '</p>' +
      '<p>Повторная проверка результата: ошибок ' + R.c.error + ', предупреждений ' + R.c.warn + ', сведений ' + R.c.info + '.' + (R.c.error ? ' Оставшиеся ошибки автоматически не исправляются — смотрите раздел 3.' : '') + '</p>';
    renderFix(); $('bisBase').querySelector('option[value=fixed]').disabled = false; $('bisBase').value = 'fixed'; bisInit(); renderMan();
  }
  $('doFix').onclick = function () {
    var f = cur, R = buildFixed(f), nm = split(f.name).base + '.fixed' + split(f.name).ext;
    saveDoc(f, R.doc, '.fixed', 'fixed').then(function (w) {
      fixReport(f, R, w ? 'Записан <code>' + esc(w.path) + '</code>.' : 'Скачан <b>' + esc(nm) + '</b>.');
    }, function () { });
  };
  $('doReplace').onclick = function () {
    var f = cur; if (!SRV || !f.path) return;
    api('/api/procs').then(function (pr) {
      var warn = pr.procs && pr.procs.length ? '\n\nВнимание: запущен DipTrace (' + pr.procs.join(', ') + '). Закройте в нём эту библиотеку, иначе он может перезаписать файл.' : '';
      if (!confirm('Заменить исходный файл исправленным?\n\n' + f.path + '\n\nПеред записью будет создана резервная копия <имя>.bak-ГГГГММДД-ччммсс рядом с ним.' + warn)) return;
      var R = buildFixed(f);
      return saveDoc(f, R.doc, '', 'replace').then(function (w) {
        var msg = '<p>Исходный файл заменён: <code>' + esc(w.path) + '</code> (исправлений: ' + f.log.length + '). Резервная копия: <code>' + esc(w.backup || '—') + '</code>. Файл перечитан — результаты проверки выше относятся к новой версии.</p>';
        return loadPaths([f.path]).then(function () { $('fixRes').innerHTML = msg; });
      });
    }).catch(function (e) { toast('Ошибка: ' + esc(e.message), null, true); });
  };

  $('csvLog').onclick = function () {
    var rows = [['Проход', 'Код', 'Проблема', 'Объект', 'Строка исходника', 'Что сделано']];
    (cur.log || []).forEach(function (x) { rows.push([x.pass === 0 ? 'разбор' : x.pass, x.code, (DC.CODES[x.code] || [, , ''])[2], x.obj, x.ln || '', x.msg]); });
    saveCsv(cur, '.fixlog.csv', rows);
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
    on('bWithout', function () { var keep = B.all.map(function (x) { return x.i; }).filter(function (i) { return i !== B.cand[0]; }); saveDoc(cur, DC.subset(baseDoc(), B.mode, keep, null), '.without_' + safe(nm(B.cand[0])), 'fixed'); });
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

  // ---------- локальный сервер: папки, базы, подключённые в DipTrace ----------
  var CFG = null, INFO = null, DTV = {}, DTG = null, DTD = null, LIBS = [], LIBDIRS = [], REG = {};
  function saveCfg() { return api('/api/config', CFG).then(function (c) { CFG = c; }); }
  function b64bytes(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : n >= 1024 ? Math.round(n / 1024) + ' КБ' : n + ' Б'; }
  function loadedBy(p) { var k = String(p).toLowerCase(); return files.find(function (f) { return f.path && f.path.toLowerCase() === k; }); }
  function stateCell(p, cloud) {
    var f = loadedBy(p);
    if (f) { if (f.err) return '<span class="b error">не разобран</span>'; var c = counts(f.iss); return (c.error ? '<span class="b error">ошибок ' + c.error + '</span> ' : '') + (c.warn ? '<span class="b warn">предупр. ' + c.warn + '</span>' : '') + (!c.error && !c.warn ? '<span class="b ok">в порядке</span>' : ''); }
    return cloud ? '<span class="b warn">только в облаке</span>' : '<span class="small mute">не проверен</span>';
  }
  function srvInit() {
    $('secSrv').classList.remove('hidden'); $('srvBadge').classList.remove('hidden'); $('srvStop').classList.remove('hidden');
    $('srvBadge').textContent = 'локальный сервер :' + SRV.port;
    ['m3Help', 'm3CmdRow', 'm3Manual'].forEach(function (id) { $(id).classList.add('hidden'); });
    $('m3Setup').querySelector('summary').textContent = 'Папки 3D-моделей';
    $('srvInfo').textContent = 'Подключение к локальному серверу…';
    api('/api/info').then(function (i) {
      INFO = i; CFG = i.config; $('libRecurse').checked = CFG.recurse !== false;
      return refreshDT();
    }).then(function () {
      if (!CFG.libDirs || !CFG.libDirs.length) {
        var d = [DTV['%mylibs%'] || 'C:\\Users\\limar\\OneDrive\\DipTrace\\lib'];
        (DTG ? DTG.libs : []).forEach(function (l) { if (/xml$/.test(l.ext)) { var x = dirOf(l.path); if (!d.some(function (y) { return y.toLowerCase() === x.toLowerCase(); })) d.push(x); } });
        CFG.libDirs = d; saveCfg();
      }
      if (CFG.my3d) $('preMy').value = CFG.my3d; else if (DTV['%my3dmodels%']) $('preMy').value = DTV['%my3dmodels%'];
      if (CFG.main3d) $('preMain').value = CFG.main3d; else if (INFO.dt.maindir) $('preMain').value = INFO.dt.maindir + '\\models3d';
      renderSrvInfo(); renderProto(); renderDirs(); refreshLibs(); run3d();
    }).catch(function (e) { $('srvInfo').innerHTML = '<span class="b error">Сервер недоступен: ' + esc(e.message) + '</span> Запустите DipTrace-XML-Repair.cmd заново.'; });
  }
  function renderSrvInfo() {
    var d = INFO.dt, main = (d.installs || []).filter(function (x) { return x.name === 'DipTrace'; })[0];
    $('srvInfo').innerHTML = 'Компьютер <b>' + esc(INFO.computer) + '</b> · ' + (main ? 'DipTrace ' + esc(main.version) + ' — <code>' + esc(d.maindir) + '</code>' : d.maindir ? 'DipTrace — <code>' + esc(d.maindir) + '</code>' : '<span class="b warn">DipTrace не найден в реестре</span>') +
      (d.procs && d.procs.length ? ' · <span class="b warn">запущено: ' + esc(d.procs.join(', ')) + '</span>' : ' · DipTrace не запущен') +
      ' · настройки инструмента: <code>' + esc(INFO.cfgFile) + '</code>';
    $('dtDataDir').textContent = d.dataDir;
  }
  function refreshDT() {
    return api('/api/dtdata').then(function (D) {
      DTD = D; DTV = {}; DTG = null; REG = {};
      var g = null, v = null;
      (D.files || []).forEach(function (f) { if (f.name === 'libgroups_var.dat') v = b64bytes(f.b64); if (f.name === 'libgroups.dat') g = b64bytes(f.b64); });
      if (v) DTV = DD.vars(v);
      if (g) { DTG = DD.groups(g, DTV); DTG.libs.forEach(function (l) { REG[l.path.toLowerCase()] = 1; }); }
      $('dtVars').innerHTML = Object.keys(DTV).length ? 'Переменные: ' + Object.keys(DTV).map(function (k) { return '<span class="pill"><code>' + esc(k) + '</code> = <code>' + esc(DTV[k]) + '</code></span>'; }).join('') : (D.exists ? '<span class="mute">Переменные путей не найдены.</span>' : '<span class="b warn">Папка данных DipTrace не найдена</span>');
      $('dtBaks').innerHTML = (D.backups || []).length ? 'Резервные копии групп: ' + D.backups.slice(0, 5).map(function (b) { return '<button data-ts="' + esc(b.ts) + '" class="dtRestore">Восстановить ' + esc(b.ts.replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)$/, '$3.$2.$1 $4:$5')) + '</button>'; }).join(' ') : '';
      Array.prototype.forEach.call(document.querySelectorAll('.dtRestore'), function (b) { b.onclick = function () { restoreDT(b.dataset.ts); }; });
      var libs = DTG ? DTG.libs : [];
      if (!libs.length) { $('dtLibs').innerHTML = '<p class="small mute">' + (g ? 'Своих библиотек в группах не найдено.' : 'libgroups.dat не найден.') + '</p>'; return; }
      return api('/api/stat', { paths: libs.map(function (l) { return l.path; }) }).then(function (st) {
        var S = {}; (st.files || []).forEach(function (x) { S[x.path.toLowerCase()] = x; });
        $('dtLibs').innerHTML = '<div class="tw"><table><thead><tr><th>Библиотека</th><th>Формат</th><th class="num">Размер</th><th>Изменён</th><th>Состояние</th><th></th></tr></thead><tbody>' + libs.map(function (l) {
          var x = S[l.path.toLowerCase()] || {}, xml = /xml$/.test(l.ext);
          return '<tr><td class="small"><b>' + esc(l.path.replace(/^.*[\\\/]/, '')) + '</b><div class="mute">' + esc(dirOf(l.path)) + '</div></td><td class="small">' + (xml ? 'XML' : 'двоичный .' + esc(l.ext)) + '</td>' +
            '<td class="num small">' + (x.exists ? fmtSize(x.size) : '') + '</td><td class="small">' + (x.exists ? esc(fmtDate(x.mtime)) : '') + '</td>' +
            '<td>' + (!x.exists ? '<span class="b error">файл не найден</span>' : xml ? stateCell(l.path, x.cloud) : '<span class="small mute">проверяется только XML</span>') + '</td>' +
            '<td>' + (x.exists && xml ? '<button class="dtOpen" data-p="' + esc(l.path) + '">Открыть</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
        Array.prototype.forEach.call(document.querySelectorAll('.dtOpen'), function (b) { b.onclick = function () { openPath(b.dataset.p); }; });
      });
    });
  }
  function openPath(p) { var f = loadedBy(p); if (f && !f.err) { select(f); renderFiles(); renderLibs(); $('secInfo').scrollIntoView({ behavior: 'smooth' }); } else loadPaths([p]); }
  $('dtOpenXml').onclick = function () { var l = (DTG ? DTG.libs : []).filter(function (x) { return /xml$/.test(x.ext); }).map(function (x) { return x.path; }); if (l.length) loadPaths(l); };
  $('dtReset').onclick = function () {
    api('/api/procs').then(function (pr) {
      if (pr.procs && pr.procs.length) { alert('Сначала закройте DipTrace: ' + pr.procs.join(', ')); return; }
      if (!confirm('Сбросить группы библиотек DipTrace?\n\nlibgroups.dat и libgroups_var.dat будут переименованы в *.dtr-bak-<время> (не удалены). При следующем запуске DipTrace создаст их заново: стандартные библиотеки останутся, свои библиотеки и переменные (%mylibs%, %my3dmodels%) нужно будет подключить снова.\n\nВернуть прежние можно кнопкой «Восстановить».')) return;
      return api('/api/dtdata/reset', {}).then(function (r) { toast('Переименовано: ' + esc(r.renamed.join(', ')) + ' → *.dtr-bak-' + esc(r.ts) + '. Запустите DipTrace.'); return refreshDT(); });
    }).catch(function (e) { toast('Ошибка: ' + esc(e.message), null, true); });
  };
  function restoreDT(ts) {
    if (!confirm('Вернуть группы библиотек из резервной копии ' + ts + '?\nDipTrace должен быть закрыт. Текущие файлы будут сохранены как *.dtr-new-<время>.')) return;
    api('/api/dtdata/restore', { ts: ts }).then(function (r) { toast('Восстановлено: ' + esc(r.restored.join(', '))); return refreshDT(); }).catch(function (e) { toast('Ошибка: ' + esc(e.message), null, true); });
  }
  function renderDirs() {
    $('libDirs').innerHTML = (CFG.libDirs || []).map(function (d, i) { return '<span class="chip"><code>' + esc(d) + '</code><button data-i="' + i + '" title="Отключить папку">×</button></span>'; }).join('') || '<span class="small mute">Папки не подключены.</span>';
    Array.prototype.forEach.call($('libDirs').querySelectorAll('button'), function (b) { b.onclick = function () { CFG.libDirs.splice(+b.dataset.i, 1); saveCfg().then(function () { renderDirs(); refreshLibs(); }); }; });
  }
  function addDir(d) {
    d = String(d || '').trim().replace(/^"|"$/g, '').replace(/[\\\/]+$/, ''); if (!d) return;
    if ((CFG.libDirs || []).some(function (x) { return x.toLowerCase() === d.toLowerCase(); })) return;
    CFG.libDirs = (CFG.libDirs || []).concat([d]); saveCfg().then(function () { renderDirs(); refreshLibs(); });
  }
  $('addDirPick').onclick = function () { $('addDirPick').disabled = true; api('/api/pick', { kind: 'dir', start: (CFG.libDirs || [])[0] || '' }).then(function (r) { (r.paths || []).forEach(addDir); if (!(r.paths || []).length) toast('Окно выбора закрыто без выбора. Если окно не появилось — оно может быть за браузером.'); }).catch(function (e) { toast('Ошибка: ' + esc(e.message), null, true); }).then(function () { $('addDirPick').disabled = false; }); };
  $('addDirBtn').onclick = function () { addDir($('addDirPath').value); $('addDirPath').value = ''; };
  $('addDirPath').onkeydown = function (e) { if (e.key === 'Enter') $('addDirBtn').onclick(); };
  $('libRecurse').onchange = function () { CFG.recurse = $('libRecurse').checked; saveCfg().then(refreshLibs); };
  $('pickFiles').onclick = function () { api('/api/pick', { kind: 'files', start: (CFG.libDirs || [])[0] || '' }).then(function (r) { if ((r.paths || []).length) loadPaths(r.paths); }).catch(function (e) { toast('Ошибка: ' + esc(e.message), null, true); }); };
  function refreshLibs() {
    $('libCnt').textContent = 'Поиск…';
    return api('/api/list', { dirs: CFG.libDirs || [], recurse: CFG.recurse !== false }).then(function (r) {
      LIBS = []; LIBDIRS = r.dirs || [];
      LIBDIRS.forEach(function (d) { (d.files || []).forEach(function (f) { f.root = d.dir; LIBS.push(f); }); });
      renderLibs();
    }).catch(function (e) { $('libCnt').textContent = 'Ошибка: ' + e.message; });
  }
  function renderLibs() {
    if (!SRV || !CFG) return;
    var q = $('libQ').value.trim().toLowerCase(), shown = 0;
    var miss = LIBDIRS.filter(function (d) { return !d.exists; }).map(function (d) { return '<tr><td></td><td colspan="5"><span class="b error">папка не найдена</span> <code>' + esc(d.dir) + '</code></td></tr>'; }).join('');
    $('libT').innerHTML = miss + LIBS.map(function (f, i) {
      var nm = f.path.replace(/^.*[\\\/]/, ''); if (q && nm.toLowerCase().indexOf(q) < 0) return '';
      shown++;
      var rel = dirOf(f.path).slice(f.root.length).replace(/^[\\\/]/, '') || '.';
      return '<tr data-i="' + i + '" class="' + (loadedBy(f.path) ? 'loaded' : '') + '"><td><input type="checkbox" data-i="' + i + '"></td><td><b>' + esc(nm) + '</b>' + (REG[f.path.toLowerCase()] ? ' <span class="b info">подключена в DipTrace</span>' : '') + '</td><td class="mono small" title="' + esc(dirOf(f.path)) + '">' + esc(rel) + '</td><td class="num">' + fmtSize(f.size) + '</td><td>' + esc(fmtDate(f.mtime)) + '</td><td>' + stateCell(f.path, f.cloud) + '</td></tr>';
    }).join('');
    $('libCnt').textContent = 'Найдено: ' + LIBS.length + (q ? ', показано: ' + shown : '');
    Array.prototype.forEach.call($('libT').querySelectorAll('tr[data-i]'), function (tr) { tr.onclick = function (e) { if (e.target.tagName === 'INPUT') return; openPath(LIBS[+tr.dataset.i].path); }; });
  }
  function checkedLibs(all) { return Array.prototype.filter.call($('libT').querySelectorAll('input[data-i]'), function (c) { return all || c.checked; }).map(function (c) { return LIBS[+c.dataset.i].path; }); }
  $('libQ').oninput = renderLibs;
  $('libAll').onchange = function () { Array.prototype.forEach.call($('libT').querySelectorAll('input[data-i]'), function (c) { c.checked = $('libAll').checked; }); };
  $('libOpenSel').onclick = function () { var l = checkedLibs(false); if (l.length) loadPaths(l); else toast('Отметьте библиотеки в списке.'); };
  $('libOpenAll').onclick = function () { var l = checkedLibs(true); if (!l.length) return; if (l.length > 40 && !confirm('Проверить ' + l.length + ' библиотек? Это может занять время и память браузера.')) return; loadPaths(l); };
  $('libRefresh').onclick = function () { refreshLibs(); refreshDT(); api('/api/info').then(function (i) { INFO = i; renderSrvInfo(); }); };
  $('csvAll').onclick = function () {
    var rows = [['Файл', 'Путь', 'Тип', 'Корпусов', 'Компонентов', 'Уровень', 'Код', 'Проблема', 'Объект', 'Строка', 'Подробно']];
    files.forEach(function (f) {
      if (f.err) { rows.push([f.name, f.path || '', '', '', '', 'ошибка', 'PARSE', 'Не разобран', '', '', f.err]); return; }
      if (!f.iss.length) rows.push([f.name, f.path || '', f.stats.type, f.stats.patterns, f.stats.components, '', '', 'Замечаний нет', '', '', '']);
      f.iss.forEach(function (x) { var m = DC.CODES[x.code] || ['info', false, x.code]; rows.push([f.name, f.path || '', f.stats.type, f.stats.patterns, f.stats.components, SEVN[m[0]], x.code, m[2], x.obj, x.ln || '', x.msg]); });
    });
    var d = new Date(), ts = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    download('dtr-svodka-' + ts + '.csv', csv(rows), 'text/csv');
  };
  function run3d() {
    if (!SRV || !CFG) return;
    $('m3State').textContent = 'Чтение папок 3D-моделей…';
    var my = [$('preMy').value.trim(), CFG.my3d, DTV['%my3dmodels%']], main = [$('preMain').value.trim(), CFG.main3d, INFO && INFO.dt.maindir ? INFO.dt.maindir + '\\models3d' : ''];
    api('/api/models', { my: my.filter(Boolean), main: main.filter(Boolean) }).then(function (X) { applyIndex(X); recheckAll(); if (DTG) refreshDT(); renderLibs(); })
      .catch(function (e) { $('m3State').innerHTML = '<span class="b error">' + esc(e.message) + '</span>'; });
  }
  $('srvStop').onclick = function () {
    if (!confirm('Остановить локальный сервер? Инструмент перестанет видеть папки до следующего запуска DipTrace-XML-Repair.cmd.')) return;
    api('/api/shutdown', {}).then(function () { document.body.innerHTML = '<main><section><h2>Сервер остановлен</h2><p>Эту вкладку можно закрыть. Для нового запуска — DipTrace-XML-Repair.cmd.</p></section></main>'; });
  };
  // ---------- самодостаточный запуск сервера ----------
  var PORTS = [8765, 8766, 8767, 8768];
  function pageSnap() {
    return String(window.DTR_SNAP || '').replace(/window\.DTR_SERVER=\{token:\"[0-9a-f]{32}\",port:\d+,version:\"[^\"]*\"\};/, '/*__DTR_' + 'SERVER__*/')
      .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '');   // скрипты, внедрённые фильтрами (AdGuard и т.п.)
  }
  // Сервер с встроенной страницей: обычный сценарий PowerShell (страница — здесь-строка $EMBED_HTML), без iex/кодирования.
  function makeServerPs1() {
    var ps = String(window.DTR_PS || '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    var emb = pageSnap().replace(/^'@/mg, " '@");
    return "$EMBED_HTML = @'\r\n" + emb + "\r\n'@\r\n" + ps;
  }
  // .cmd = пакетный заголовок в комментарии PowerShell <# ... #> + тот же сценарий: копирует себя в server.ps1 и запускает через -File.
  function makeServerCmd() { return (window.DTR_CMDHDR || []).join('\r\n') + makeServerPs1(); }
  window.__makeServerCmd = makeServerCmd;
  function dlServer() {
    if (!window.DTR_PS) { toast('В этой сборке страницы нет встроенного сервера', null, true); return; }
    download('DipTrace-XML-Repair.cmd', makeServerCmd(), 'application/octet-stream');
  }
  function dlBlob(name, parts, mime) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(parts, { type: mime || 'application/octet-stream' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function dlPs1() { if (!window.DTR_PS) return; dlBlob('server.ps1', [new Uint8Array([0xEF, 0xBB, 0xBF]), makeServerPs1()], 'text/plain'); }
  function utf16(str) { var u = new Uint16Array(str.length + 1); u[0] = 0xFEFF; for (var i = 0; i < str.length; i++) u[i + 1] = str.charCodeAt(i); return u; }
  function regq(v) { return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function dlReg(install) {
    var pr = INFO.proto, K = 'HKEY_CURRENT_USER\\Software\\Classes\\dtrepair', t;
    if (install) {
      var cmd = '"' + pr.powershell + '" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + pr.script + '" "%1"';
      t = ['Windows Registry Editor Version 5.00', '', '[' + K + ']', '@="URL:DipTrace XML Repair"', '"URL Protocol"=""', '',
        '[' + K + '\\shell\\open\\command]', '@=' + regq(cmd), ''];
    } else t = ['Windows Registry Editor Version 5.00', '', '[-' + K + ']', ''];
    dlBlob(install ? 'dtrepair-install.reg' : 'dtrepair-uninstall.reg', [utf16(t.join('\r\n'))], 'application/octet-stream');
    toast('Откройте скачанный .reg и подтвердите импорт в реестр (раздел текущего пользователя, без прав администратора). Затем обновите эту страницу.');
  }
  function ping(p) {
    var c = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (c) c.abort(); }, 1500);
    return fetch('http://127.0.0.1:' + p + '/api/ping', { mode: 'no-cors', cache: 'no-store', signal: c ? c.signal : undefined })
      .then(function () { clearTimeout(t); return p; }, function () { clearTimeout(t); return null; });
  }
  function findSrv() { return Promise.all(PORTS.map(ping)).then(function (r) { return r.filter(Boolean)[0] || null; }); }
  var pollT = null;
  function srvUp(p, go) {
    var url = 'http://127.0.0.1:' + p + '/';
    if (go) { $('launchState').textContent = 'Сервер запущен, открываю…'; location.href = url; return; }
    $('launchState').innerHTML = '<span class="b ok">сервер запущен</span> <a href="' + url + '">Открыть инструмент с сервером</a>';
  }
  function poll(sec, go, onTick) {
    clearInterval(pollT); var t0 = Date.now(), busy = false;
    pollT = setInterval(function () {
      if (busy) return; var el = (Date.now() - t0) / 1000;
      if (el > sec) { clearInterval(pollT); $('launchState').textContent = 'Сервер не отвечает.'; $('launchHelp').classList.remove('hidden'); return; }
      if (onTick) onTick(el);
      busy = true; findSrv().then(function (p) { busy = false; if (p) { clearInterval(pollT); srvUp(p, go); } });
    }, 1000);
  }
  function launchInit() {
    $('secLaunch').classList.remove('hidden');
    if (!window.DTR_PS) { $('dlSrv').disabled = true; $('runSrv').disabled = true; $('launchState').textContent = 'Сборка без встроенного сервера.'; return; }
    findSrv().then(function (p) { if (p) srvUp(p, false); });
    $('runSrv').onclick = function () {
      $('launchState').textContent = 'Поиск запущенного сервера…';
      findSrv().then(function (p) {
        if (p) { srvUp(p, true); return; }
        $('launchState').textContent = 'Запуск через ссылку dtrepair:…';
        location.href = 'dtrepair://start/?nobrowser';
        poll(120, true, function (el) {
          if (el > 5) { $('launchHelp').classList.remove('hidden'); $('launchState').textContent = 'Ждём сервер… Если ничего не произошло — быстрый запуск ещё не установлен (см. ниже).'; }
        });
      });
    };
    $('dlSrv').onclick = function () {
      dlServer(); $('launchHelp').classList.remove('hidden');
      $('launchState').textContent = 'Откройте скачанный файл — инструмент откроется в новой вкладке. Ждём сервер…';
      poll(600, false);
    };
  }
  $('dlSrv2').onclick = dlServer;
  function renderProto() {
    var pr = INFO && INFO.proto;
    if (!pr || !INFO.windows) { $('protoInfo').textContent = ''; $('protoDel').classList.add('hidden'); $('protoReg').classList.add('hidden'); return; }
    var stable = pr.script && pr.dir && pr.script.toLowerCase().indexOf(pr.dir.toLowerCase()) === 0;
    $('protoInfo').innerHTML = pr.installed ? 'Быстрый запуск (<code>dtrepair:</code>) установлен: <code>' + esc(pr.command) + '</code>'
      : (stable ? 'Быстрый запуск не установлен.' : 'Быстрый запуск: сервер запущен не из <code>' + esc(pr.dir) + '</code> — запустите DipTrace-XML-Repair.cmd, он сам копирует туда server.ps1.');
    $('protoReg').classList.toggle('hidden', !(pr.script && pr.powershell));
    $('protoReg').textContent = pr.installed ? 'Обновить быстрый запуск (.reg)' : 'Установить быстрый запуск (.reg)';
    $('protoDel').classList.toggle('hidden', !pr.installed);
  }
  $('protoReg').onclick = function () { dlReg(true); };
  $('protoDel').onclick = function () { dlReg(false); };
  $('dlPs1').onclick = function (e) { e.preventDefault(); dlPs1(); };
  if (SRV) srvInit(); else launchInit();
};
