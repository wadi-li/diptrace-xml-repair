/* Проверки и исправления библиотек DipTrace XML (.libxml / .elixml) */
var DC = (function () {
  'use strict';
  var X = (typeof DX !== 'undefined') ? DX : require('./xml.js');
  var kid = X.kid, kids = X.kids, txt = X.txt, at = X.at, setA = X.setA, delA = X.delA, el = X.el;

  // ---- справочник кодов ----
  // sev: error | warn | info ; fix: 'auto' (исправляется всегда при сохранении), true (есть исправление), false
  var CODES = {
    X_TRUNC: ['error', 'auto', 'Файл обрезан / не закрыты теги до конца файла'],
    X_UNCLOSED: ['error', 'auto', 'Незакрытый тег'],
    X_STRAY: ['error', 'auto', 'Лишний закрывающий тег'],
    X_TAG: ['error', 'auto', 'Повреждённый тег'],
    X_ATTR: ['error', 'auto', 'Мусор внутри тега'],
    X_DUPATTR: ['error', 'auto', 'Повторный атрибут'],
    X_MULTIROOT: ['error', 'auto', 'Несколько корневых элементов'],
    X_CTRL: ['error', 'auto', 'Недопустимые управляющие символы (NUL и т. п.)'],
    X_CHARREF: ['error', 'auto', 'Недопустимая символьная ссылка &#..;'],
    X_AMP: ['warn', 'auto', 'Неэкранированный «&»'],
    X_LT: ['warn', 'auto', 'Неэкранированный «<»'],
    X_ATTRLT: ['warn', 'auto', '«<» в значении атрибута'],
    X_MIXED: ['warn', 'auto', 'Текст между дочерними элементами'],
    X_OUTSIDE: ['warn', 'auto', 'Текст вне корня'],
    X_DOCTYPE: ['warn', 'auto', 'DOCTYPE / ENTITY'],
    X_DECLPOS: ['warn', 'auto', 'Повторное объявление XML'],
    X_CDATA: ['info', 'auto', 'CDATA'],
    X_COMMENT: ['info', 'auto', 'Комментарии XML'],
    X_NL: ['warn', 'auto', 'Смешанные переводы строк (приводятся к CRLF)'],
    X_DECL: ['info', 'auto', 'Нет объявления XML'],
    X_BOM: ['info', 'auto', 'Нет BOM'],
    R_TYPE: ['error', false, 'Неизвестный тип корня Library'],
    R_UNITS: ['error', true, 'Недопустимые единицы Units'],
    R_NESTED: ['error', false, 'Нет вложенной библиотеки корпусов в .elixml'],
    S_NONAME: ['error', true, 'Стиль площадки без имени'],
    S_DUP: ['error', true, 'Повтор имени стиля площадки'],
    S_TYPE: ['error', true, 'Недопустимый тип стиля площадки'],
    S_HOLE: ['error', true, 'Сквозная площадка без отверстия'],
    S_STACK: ['error', true, 'Нет MainStack у стиля площадки'],
    S_SHAPE: ['error', true, 'Недопустимая форма MainStack'],
    S_SIZE: ['error', true, 'Нулевой/неверный размер площадки'],
    S_POLY: ['error', true, 'Полигональная площадка без точек'],
    S_UNUSED: ['info', true, 'Неиспользуемые стили площадок'],
    P_ID: ['error', true, 'Id корпусов не по порядку 0..N-1'],
    P_STYLE: ['error', true, 'PatternStyle пуст или повторяется (.elixml)'],
    P_NONAME: ['warn', true, 'Корпус без имени'],
    P_DUPNAME: ['info', false, 'Повтор имени корпуса'],
    P_MOUNT: ['warn', true, 'Недопустимое значение Mounting'],
    P_MOUNTNONE: ['info', true, 'Mounting="None" (в спецификации такого значения нет)'],
    P_TYPE: ['warn', true, 'Недопустимый тип шаблона Type'],
    P_TPL: ['warn', true, 'Шаблон Lines: Int2 не совпадает с числом площадок'],
    P_ORIENT: ['warn', true, 'Недопустимое Orientation'],
    P_DEFPAD: ['error', true, 'DefPad отсутствует или ссылается на несуществующий стиль'],
    P_PADSTYLE: ['error', true, 'Площадка ссылается на несуществующий стиль'],
    P_PADID: ['error', true, 'Повтор или неверный Id площадки'],
    P_PADNUM: ['info', false, 'Площадка без номера'],
    P_PADSIDE: ['warn', true, 'Недопустимое Side площадки'],
    P_NOPADS: ['info', false, 'Корпус без площадок'],
    P_DUPCHILD: ['error', true, 'Повтор блока внутри элемента (два <Pads> и т. п.)'],
    P_ORDER: ['info', true, 'Порядок блоков не как у DipTrace'],
    G_SHID: ['warn', true, 'Повтор или неверный Id фигуры'],
    G_SHTYPE: ['error', true, 'Недопустимый тип фигуры'],
    G_SHPTS: ['error', true, 'Фигуре не хватает точек'],
    G_SHTXT: ['warn', true, 'Текстовая фигура без строк'],
    G_LAYER: ['warn', true, 'Недопустимый слой фигуры'],
    G_SHPAD: ['warn', true, 'Фигура ссылается на несуществующую площадку'],
    G_GROUP: ['warn', true, 'Ссылка на несуществующую группу'],
    G_HOLEID: ['info', true, 'Повтор Id отверстия'],
    G_DIMREF: ['warn', true, 'Размер ссылается на несуществующий объект'],
    N_NUM: ['error', true, 'Нечисловое / бесконечное значение координаты или размера'],
    N_COMMA: ['warn', true, 'Десятичная запятая в числе'],
    N_BIG: ['warn', false, 'Подозрительно большая координата/размер'],
    N_COUNT: ['warn', false, 'Очень много объектов в одном корпусе/символе'],
    C_TREE: ['warn', true, 'Номера в дереве категорий не по порядку'],
    C_REF: ['error', true, 'Ссылка на категорию / тип / подтип не совпадает с деревом'],
    F_NONAME: ['error', true, 'Пользовательское поле без имени'],
    F_DUP: ['warn', true, 'Повтор имени пользовательского поля'],
    F_TYPE: ['warn', true, 'Недопустимый тип поля'],
    F_NOTEXT: ['warn', true, 'Поле без элемента <Text>'],
    M_NONE: ['info', true, 'Нет блока Model3D'],
    M_UNC: ['warn', false, '3D-модель на сетевом пути (\\\\сервер) — при недоступности возможны долгие паузы'],
    M_MISSING: ['warn', true, '3D-модель не найдена в указанной папке'],
    M_CLOUD: ['warn', false, '3D-модель хранится только в облаке OneDrive — при открытии будет скачиваться'],
    M_NOFILE: ['info', false, 'Model3D Type="File" без имени файла'],
    M_ZOOM: ['warn', true, 'Нулевой масштаб 3D-модели'],
    M_ENUM: ['warn', true, 'Недопустимые Units/Type у Model3D'],
    E_CID: ['error', true, 'Id компонентов не по порядку 0..N-1'],
    E_NOPART: ['error', true, 'Компонент без частей Part'],
    E_PID: ['warn', true, 'Id частей Part не по порядку'],
    E_PATREF: ['error', true, 'Компонент ссылается на несуществующий корпус (Pattern Style)'],
    E_PINID: ['warn', true, 'Id выводов не по порядку'],
    E_PINPAD: ['error', true, 'Вывод ссылается на несуществующую площадку (PadId/PadNumber)'],
    E_PINNOPAD: ['warn', false, 'Номер площадки вывода отсутствует в корпусе'],
    E_INTCON: ['error', true, 'Внутреннее соединение на несуществующую площадку (по спецификации — вызывает сбой)'],
    E_SUBF: ['warn', true, 'SubFolderIndex вне списка подпапок'],
    E_ENUM: ['warn', true, 'Недопустимые PartType/Type части'],
    E_PINENUM: ['warn', true, 'Недопустимые Orientation/Type/ElectricType вывода'],
    E_UNUSEDPAT: ['info', true, 'Корпуса во вложенной библиотеке, не используемые компонентами'],
    E_DUPNAME: ['info', false, 'Повтор имени компонента']
  };
  var DEFAULT_ON = { S_UNUSED: false, P_MOUNTNONE: false, P_TPL: false, P_ORDER: false, M_NONE: false, M_MISSING: false, E_UNUSEDPAT: false, P_NONAME: true, G_SHID: true, E_PINID: true };

  var PAD_ORDER = ['Name', 'Name_Description', 'Name_Unique', 'Value', 'Manufacturer', 'Datasheet', 'PossibleNames', 'Category', 'Origin', 'RecoveryCode', 'Groups', 'AddFields', 'Suppliers', 'DefPad', 'Pads', 'Shapes', 'Holes', 'Dimensions', 'Model3D'];
  var PART_ORDER = ['Pattern', 'Name', 'PartName', 'Value', 'LibPath', 'Origin', 'Datasheet', 'SpiceModel', 'Manufacturer', 'Category', 'Suppliers', 'Pins', 'Shapes', 'Groups', 'AddFields', 'InternalConnections'];
  var PAT_SINGLE = ['Name', 'Name_Description', 'Name_Unique', 'Value', 'Manufacturer', 'Datasheet', 'PossibleNames', 'Category', 'Origin', 'RecoveryCode', 'Groups', 'AddFields', 'Suppliers', 'DefPad', 'Pads', 'Shapes', 'Holes', 'Dimensions', 'Model3D'];
  var PART_SINGLE = ['Pattern', 'Name', 'PartName', 'Value', 'LibPath', 'Origin', 'Datasheet', 'SpiceModel', 'Manufacturer', 'Category', 'Suppliers', 'Pins', 'Shapes', 'Groups', 'AddFields', 'InternalConnections'];
  var MOUNT = ['Through', 'SMD', 'Chassis', 'Mixed'];
  var PTYPE = ['None', 'Free', 'Right Angle', 'Left Angle', 'T', 'Circle', 'Lines', 'Square', 'Matrix', 'Rectangle', 'Zig-Zag', 'IPC-7351'];
  var STACK = ['Ellipse', 'Obround', 'Rectangle', 'Polygon', 'D-shape', 'Fiducial'];
  var PSHAPE = { None: 0, Line: 2, Rectangle: 2, Obround: 2, FillRect: 2, FillObround: 2, Arc: 3, Text: 1, Polyline: 2, Polygon: 3 };
  var CSHAPE = { Undefined: 0, Line: 2, Arc: 3, Arrow: 2, Rectangle: 2, FillRect: 2, Obround: 2, FillObround: 2, Polyline: 2, Polygon: 3, Text: 1 };
  var LAYERS = ['Top Silk', 'Top Assy', 'Top Mask', 'Top Paste', 'Bottom Paste', 'Bottom Mask', 'Bottom Assy', 'Bottom Silk', 'Top', 'Top Keepout', 'Bottom Keepout', 'Bottom', 'Board Cutout', 'Top Dimension', 'Bottom Dimension', 'Non-Signal', 'Top Courtyard', 'Bottom Courtyard', 'Top Outline', 'Bottom Outline', 'Top Terminals', 'Bottom Terminals'];
  var PARTTYPE = ['Normal', 'Power', 'Net Port', 'Hierarchy Connector', 'Hierarchy Block'];
  var PARTTPL = ['Free', '2 Sides', 'IC-2 Sides', 'IC-4 Sides'];
  var ORI = ['0', '90', '180', '270'];
  var PINTYPE = ['Default', 'Dot', 'Polarity In', 'Polarity Out', 'Non Logic', 'Open', 'Open High', 'Open Low', '3 State', 'Hysteresis', 'Amplifier', 'Postponed', 'Shift', 'Clock', 'Generator'];
  var ELTYPE = ['Undefined', 'Passive', 'Input', 'Output', 'Bidirectional', 'Open High', 'Open Low', 'Passive High', 'Passive Low', '3 State', 'Power'];
  var NUMATTR = { X: 1, Y: 1, X1: 1, Y1: 1, X2: 1, Y2: 1, XD: 1, YD: 1, Width: 1, Height: 1, Hole: 1, HoleH: 1, XOff: 1, YOff: 1, Diam: 1, HoleDiam: 1, Angle: 1, Length: 1, LineWidth: 1, Corner: 1, IPC_XOff: 1, IPC_YOff: 1 };
  var POSATTR = { Width: 1, Height: 1 };

  function num(v) { if (v == null) return NaN; var s = String(v).trim(); if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/.test(s)) return NaN; return parseFloat(s.replace(',', '.')); }
  function isInt(v) { return v != null && /^-?\d+$/.test(String(v).trim()); }

  // ---------- модель ----------
  function model(doc) {
    var root = doc.root, L = { doc: doc, root: root, kind: '', type: at(root, 'Type') || '', units: at(root, 'Units') || 'mm' };
    if (L.type === 'DipTrace-PatternLibrary') { L.kind = 'l'; L.pl = root; }
    else if (L.type === 'DipTrace-ComponentLibrary') { L.kind = 'e'; L.pl = null; for (var i = 0; i < root.c.length; i++) if (root.c[i].t === 'Library' && at(root.c[i], 'Type') === 'DipTrace-PatternLibrary') { L.pl = root.c[i]; break; } }
    L.patterns = L.pl ? kids(kid(L.pl, 'Patterns'), 'Pattern') : [];
    L.components = L.kind === 'e' ? kids(kid(root, 'Components'), 'Component') : [];
    L.scale = L.units === 'inch' ? 1 / 25.4 : L.units === 'mil' ? 1000 / 25.4 : 1;
    return L;
  }
  function patLabel(p, i) { return 'Корпус #' + i + ' «' + (txt(p, 'Name') || '?') + '»'; }
  function compLabel(c, i) { var P = kid(c, 'Part'); return 'Компонент #' + i + ' «' + (txt(P, 'Name') || '?') + '»'; }

  // ---------- проверка ----------
  function check(doc, opt) {
    opt = opt || {};
    var out = [];
    function add(code, obj, ln, msg, fix, ctx) { out.push({ code: code, obj: obj || '', ln: ln || 0, msg: msg, fix: fix || null, ctx: ctx || null }); }
    (doc.issues || []).forEach(function (q) { add(q.code, 'Файл', q.ln, q.msg, null); });
    if (!doc.root) { add('X_TRUNC', 'Файл', 0, 'Корневой элемент не найден — файл пуст или не XML', null); return out; }
    var L = model(doc);
    if (!L.kind) { add('R_TYPE', 'Library', doc.root.ln, 'Type="' + L.type + '". Ожидается DipTrace-PatternLibrary (.libxml) или DipTrace-ComponentLibrary (.elixml)', null); return out; }
    if (['mm', 'inch', 'mil'].indexOf(L.units) < 0) add('R_UNITS', 'Library', doc.root.ln, 'Units="' + L.units + '"', function () { setA(doc.root, 'Units', 'mm'); });
    if (L.kind === 'e' && !L.pl) { add('R_NESTED', 'Library', doc.root.ln, 'Нет <Library Type="DipTrace-PatternLibrary"> внутри .elixml', null); }
    var big = 2000 * L.scale;

    // числа — общий обход
    (function walk(n, label) {
      for (var i = 0; i < n.a.length; i++) {
        var k = n.a[i][0]; if (!NUMATTR[k]) continue;
        var v = n.a[i][1];
        if (n.t === 'Model3D' || n.t === 'Rotate' || n.t === 'Offset' || n.t === 'Zoom') { if (k !== 'X' && k !== 'Y' && k !== 'IPC_XOff' && k !== 'IPC_YOff') continue; }
        var f = num(v);
        if (isNaN(f) || !isFinite(f)) { (function (n, i, k, v) { add('N_NUM', label, n.ln, '<' + n.t + '> ' + k + '="' + v + '" — будет 0', function () { n.a[i][1] = '0'; }); })(n, i, k, v); }
        else if (String(v).indexOf(',') >= 0) { (function (n, i, k, v) { add('N_COMMA', label, n.ln, '<' + n.t + '> ' + k + '="' + v + '"', function () { n.a[i][1] = String(v).replace(',', '.'); }); })(n, i, k, v); }
        else if (k !== 'Angle' && Math.abs(f) > big && n.t !== 'Offset') add('N_BIG', label, n.ln, '<' + n.t + '> ' + k + '=' + v + ' ' + L.units, null);
      }
      for (var j = 0; j < n.c.length; j++) {
        var c = n.c[j], lb = label;
        if (c.t === 'Pattern' && n.t === 'Patterns') lb = patLabel(c, j);
        else if (c.t === 'Component') lb = compLabel(c, j);
        walk(c, lb);
      }
    })(doc.root, 'Library');

    var styleSet = {}, styleUse = {};
    if (L.pl) checkPatLib(L, add, styleSet, styleUse, opt);
    if (L.kind === 'e') checkComp(L, add, opt);
    return out;
  }

  function dupChildren(n, singles, label, add) {
    var seen = {};
    n.c.forEach(function (c) {
      if (singles.indexOf(c.t) < 0) return;
      if (seen[c.t]) { var first = seen[c.t], dup = c; add('P_DUPCHILD', label, c.ln, 'Повтор <' + c.t + '> — содержимое будет объединено с первым', function () { if (first.c.length || dup.c.length) first.c = first.c.concat(dup.c); X.remove(n, dup); }); }
      else seen[c.t] = c;
    });
  }
  function orderCheck(n, order, label, add) {
    var idx = n.c.map(function (c) { return order.indexOf(c.t); }), last = -1, bad = false;
    for (var i = 0; i < idx.length; i++) { if (idx[i] < 0) continue; if (idx[i] < last) { bad = true; break; } last = idx[i]; }
    if (bad) add('P_ORDER', label, n.ln, 'Блоки: ' + n.c.map(function (c) { return c.t; }).join(', '), function () { reorder(n, order); });
  }
  function reorder(n, order) {
    var known = n.c.filter(function (c) { return order.indexOf(c.t) >= 0; });
    known.sort(function (a, b) { return order.indexOf(a.t) - order.indexOf(b.t); });
    var k = 0; n.c = n.c.map(function (c) { return order.indexOf(c.t) >= 0 ? known[k++] : c; });
  }

  function catTree(cats, dialect) {
    // PattEdit: Number ; CompEdit: Index
    var attr = dialect === 'e' ? 'Index' : 'Number';
    var tree = kids(cats, 'Category').map(function (c) {
      return { n: c, id: at(c, attr) != null ? at(c, attr) : at(c, 'Number') != null ? at(c, 'Number') : at(c, 'Index'), name: txt(c, 'Name'), types: kids(kid(c, 'Types'), 'Type').map(function (t) { return { n: t, id: at(t, attr) != null ? at(t, attr) : at(t, 'Number') != null ? at(t, 'Number') : at(t, 'Index'), name: txt(t, 'Name'), subs: kids(kid(t, 'SubTypes'), 'SubType').map(function (s) { return { n: s, id: at(s, attr) != null ? at(s, attr) : at(s, 'Number') != null ? at(s, 'Number') : at(s, 'Index'), name: txt(s, 'Name') }; }) }; }) };
    });
    tree.attr = attr; return tree;
  }
  function checkCats(cats, refs, dialect, add) {
    if (!cats) return;
    var tree = catTree(cats, dialect), attr = tree.attr, dense = true;
    tree.forEach(function (c, i) { if (String(c.id) !== String(i)) dense = false; c.types.forEach(function (t, j) { if (String(t.id) !== String(j)) dense = false; t.subs.forEach(function (s, k) { if (String(s.id) !== String(k)) dense = false; }); }); });
    // ссылки
    function findByName(arr, name) { for (var i = 0; i < arr.length; i++) if (arr[i].name === name) return i; return -1; }
    function lookup(list, idv) { for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(idv)) return list[i]; return null; }
    refs.forEach(function (r) {
      var cat = r.cat, label = r.label, ci = at(cat, 'Index');
      if (ci == null || ci === '-1') return;
      var C = lookup(tree, ci), nm = txt(cat, 'Name'), bad = [];
      if (!C) bad.push('категория Index=' + ci + ' отсутствует');
      else if (nm && C.name !== nm) bad.push('имя «' + nm + '» ≠ «' + C.name + '»');
      if (C) kids(kid(cat, 'CategoryTypes'), 'CategoryType').forEach(function (ct) {
        var ty = kid(ct, 'Type'), st = kid(ct, 'SubType');
        if (!ty) return;
        var T = lookup(C.types, at(ty, 'Index'));
        if (!T) bad.push('тип Index=' + at(ty, 'Index') + ' отсутствует');
        else if ((ty.x || '') && T.name !== ty.x) bad.push('тип «' + ty.x + '» ≠ «' + T.name + '»');
        if (st && T && at(st, 'Index') !== '-1') { var S = lookup(T.subs, at(st, 'Index')); if (!S) bad.push('подтип Index=' + at(st, 'Index') + ' отсутствует'); else if ((st.x || '') && S.name !== st.x) bad.push('подтип «' + st.x + '» ≠ «' + S.name + '»'); }
      });
      if (bad.length) add('C_REF', label, cat.ln, bad.join('; ') + ' — привязка по имени, иначе ссылка удаляется', function () { relinkCat(r.owner, cat, tree); });
    });
    if (!dense) add('C_TREE', 'Категории', cats.ln, 'Номера ' + attr + ' в дереве не идут 0,1,2… — перенумерация с переносом ссылок', function () { renumCats(cats, refs, dialect); });
  }
  function relinkCat(owner, cat, tree) {
    var nm = txt(cat, 'Name'), C = null, ci = -1;
    for (var i = 0; i < tree.length; i++) if (tree[i].name === nm) { C = tree[i]; ci = i; break; }
    if (!C) { X.remove(owner, cat); return; }
    setA(cat, 'Index', C.id);
    var cts = kid(cat, 'CategoryTypes');
    if (cts) cts.c = cts.c.filter(function (ct) {
      var ty = kid(ct, 'Type'); if (!ty) return false;
      var T = null; for (var j = 0; j < C.types.length; j++) if (C.types[j].name === ty.x) { T = C.types[j]; break; }
      if (!T) return false; setA(ty, 'Index', T.id);
      var st = kid(ct, 'SubType');
      if (st) { var S = null; for (var k = 0; k < T.subs.length; k++) if (T.subs[k].name === st.x) { S = T.subs[k]; break; } if (!S) X.remove(ct, st); else setA(st, 'Index', S.id); }
      return true;
    });
  }
  function renumCats(cats, refs, dialect) {
    var tree = catTree(cats, dialect), attr = tree.attr;
    var mapC = {}, mapT = {}, mapS = {};
    tree.forEach(function (c, i) { mapC[c.id] = i; setA(c.n, attr, i); c.types.forEach(function (t, j) { mapT[c.id + '|' + t.id] = j; setA(t.n, attr, j); t.subs.forEach(function (s, k) { mapS[c.id + '|' + t.id + '|' + s.id] = k; setA(s.n, attr, k); }); }); });
    refs.forEach(function (r) {
      var cat = r.cat, ci = at(cat, 'Index'); if (ci == null || !(ci in mapC)) return;
      setA(cat, 'Index', mapC[ci]);
      kids(kid(cat, 'CategoryTypes'), 'CategoryType').forEach(function (ct) {
        var ty = kid(ct, 'Type'), st = kid(ct, 'SubType'); if (!ty) return; var ti = at(ty, 'Index');
        if ((ci + '|' + ti) in mapT) setA(ty, 'Index', mapT[ci + '|' + ti]);
        if (st && (ci + '|' + ti + '|' + at(st, 'Index')) in mapS) setA(st, 'Index', mapS[ci + '|' + ti + '|' + at(st, 'Index')]);
      });
    });
  }

  function checkShapes(owner, label, add, dialect, padIds, groupIds) {
    var shapes = kid(owner, 'Shapes'); if (!shapes) return;
    var T = dialect === 'p' ? PSHAPE : CSHAPE, ids = {}, badId = false;
    shapes.c.slice().forEach(function (s, j) {
      if (s.t !== 'Shape') return;
      var id = at(s, 'Id'); if (!isInt(id) || ids[id]) badId = true; ids[id] = 1;
      var ty = at(s, 'Type');
      if (!(ty in T)) { add('G_SHTYPE', label, s.ln, 'Фигура Id=' + id + ' Type="' + ty + '" — будет удалена', function () { X.remove(shapes, s); }); return; }
      var pts = kids(kid(s, 'Points'), 'Point').length, need = T[ty];
      if (pts < need) { add('G_SHPTS', label, s.ln, 'Фигура Id=' + id + ' ' + ty + ': точек ' + pts + ', нужно ≥' + need + ' — будет удалена', function () { X.remove(shapes, s); }); return; }
      if (ty === 'Text') {
        var tl = kid(s, 'TextLines'), show = at(s, 'TextShow') || 'Any Text';
        if (show === 'Any Text' && (!tl || !kids(tl, 'TextLine').length)) add('G_SHTXT', label, s.ln, 'Текст Id=' + id + ' без TextLines — пустой текст будет удалён', function () { X.remove(shapes, s); });
      }
      if (dialect === 'p') {
        var lay = at(s, 'Layer'); if (lay != null && LAYERS.indexOf(lay) < 0) add('G_LAYER', label, s.ln, 'Фигура Id=' + id + ' Layer="' + lay + '" — будет Top Silk', function () { setA(s, 'Layer', 'Top Silk'); });
        var pid = at(s, 'PadId'); if (pid != null && pid !== '0' && pid !== '-1' && padIds && !padIds[pid]) add('G_SHPAD', label, s.ln, 'Фигура Id=' + id + ' PadId=' + pid + ' — привязка будет снята', function () { delA(s, 'PadId'); });
      }
      var g = at(s, 'Group'); if (g != null && g !== '-1' && !groupIds[g]) add('G_GROUP', label, s.ln, 'Фигура Id=' + id + ' Group=' + g + ' — будет снята', function () { delA(s, 'Group'); });
    });
    if (badId) add('G_SHID', label, shapes.ln, 'Id фигур повторяются или нечисловые — перенумерация ' + (dialect === 'p' ? '1..N' : '0..N-1'), function () { renumShapes(owner, dialect); });
  }
  function renumShapes(owner, dialect) {
    var shapes = kid(owner, 'Shapes'), base = dialect === 'p' ? 1 : 0, map = {}, n = 0;
    kids(shapes, 'Shape').forEach(function (s) { var o = at(s, 'Id'); if (!(o in map)) map[o] = n + base; setA(s, 'Id', n + base); n++; });
    kids(kid(owner, 'Dimensions'), 'Dimension').forEach(function (d) { ['1', '2'].forEach(function (k) { if (at(d, 'Connected' + k) === 'Shape' && (at(d, 'Object' + k) in map)) setA(d, 'Object' + k, map[at(d, 'Object' + k)]); }); });
  }

  function checkAddFields(owner, label, add) {
    var af = kid(owner, 'AddFields'); if (!af) return;
    var seen = {};
    af.c.slice().forEach(function (f) {
      if (f.t !== 'AddField') return;
      var nm = txt(f, 'Name'), ty = at(f, 'Type');
      if (!nm.trim()) { add('F_NONAME', label, f.ln, 'Поле без имени (значение «' + txt(f, 'Text').slice(0, 40) + '») — будет удалено', function () { X.remove(af, f); }); return; }
      if (ty !== 'Text' && ty !== 'Link') add('F_TYPE', label, f.ln, 'Поле «' + nm + '» Type="' + ty + '" — будет Text', function () { setA(f, 'Type', 'Text'); });
      if (!kid(f, 'Text')) add('F_NOTEXT', label, f.ln, 'Поле «' + nm + '» без <Text> — будет добавлен пустой', function () { var t = el('Text'); t.sc = '/>'; f.c.push(t); });
      if (seen[nm]) { var first = seen[nm]; add('F_DUP', label, f.ln, 'Повтор поля «' + nm + '» — остаётся одно (непустое значение сохраняется)', function () { if (!txt(first, 'Text') && txt(f, 'Text')) X.setTxt(first, 'Text', txt(f, 'Text')); X.remove(af, f); }); }
      else seen[nm] = f;
    });
  }

  function checkPatLib(L, add, styleSet, styleUse, opt) {
    var pl = L.pl, ps = kid(pl, 'PadStyles') || kid(pl, 'PadTypes');
    var styles = kids(ps, 'PadStyle'), firstStyle = null;
    styles.slice().forEach(function (s, i) {
      var nm = at(s, 'Name'), lb = 'Стиль площадки «' + (nm || '?') + '»';
      if (!nm) { add('S_NONAME', lb, s.ln, 'PadStyle #' + i + ' без Name — будет PadFix' + i, function () { setA(s, 'Name', 'PadFix' + i); }); nm = 'PadFix' + i; }
      if (styleSet[nm]) { add('S_DUP', lb, s.ln, 'Повтор стиля «' + nm + '» — дубликат удаляется (площадки уже привязаны к первому)', function () { X.remove(ps, s); }); return; }
      styleSet[nm] = s; if (!firstStyle) firstStyle = nm;
      var ty = at(s, 'Type'), ms = kid(s, 'MainStack');
      if (ty !== 'Surface' && ty !== 'Through') add('S_TYPE', lb, s.ln, 'Type="' + ty + '" — будет ' + (at(s, 'Hole') ? 'Through' : 'Surface'), function () { setA(s, 'Type', at(s, 'Hole') ? 'Through' : 'Surface'); });
      if (!ms) { add('S_STACK', lb, s.ln, 'Нет <MainStack> — будет прямоугольник 1×1 мм (проверьте!)', function () { s.c.unshift(el('MainStack', [['Shape', 'Rectangle'], ['Width', String(+(1 * L.scale).toFixed(4))], ['Height', String(+(1 * L.scale).toFixed(4))], ['Corner', '0']])); }); return; }
      var sh = at(ms, 'Shape');
      if (STACK.indexOf(sh) < 0) add('S_SHAPE', lb, ms.ln, 'Shape="' + sh + '" — будет Rectangle', function () { setA(ms, 'Shape', 'Rectangle'); });
      var W = num(at(ms, 'Width')), H = num(at(ms, 'Height'));
      if (!(W > 0) || (sh !== 'Fiducial' && !(H > 0))) add('S_SIZE', lb, ms.ln, 'Width=' + at(ms, 'Width') + ' Height=' + at(ms, 'Height') + ' — нулевое значение заменяется другим размером или 0,5 мм (проверьте!)', function () { var d = +(0.5 * L.scale).toFixed(4); var w = W > 0 ? W : H > 0 ? H : d, h = H > 0 ? H : w; setA(ms, 'Width', w); if (sh !== 'Fiducial') setA(ms, 'Height', h); });
      if (sh === 'Polygon' && kids(kid(ms, 'Points'), 'Point').length < 3) add('S_POLY', lb, ms.ln, 'Polygon без ≥3 точек — будет Rectangle', function () { setA(ms, 'Shape', 'Rectangle'); var p = kid(ms, 'Points'); if (p) X.remove(ms, p); });
      if (ty === 'Through' && !(num(at(s, 'Hole')) > 0)) add('S_HOLE', lb, s.ln, 'Hole=' + at(s, 'Hole') + ' — будет 60 % меньшего размера площадки (проверьте!)', function () { var w = num(at(ms, 'Width')) || 1, h = num(at(ms, 'Height')) || w; setA(s, 'Hole', +(Math.min(w, h) * 0.6).toFixed(4)); if (!at(s, 'HoleType')) setA(s, 'HoleType', 'Round'); });
    });
    var pats = L.patterns, patsNode = kid(pl, 'Patterns');
    // Id по порядку
    var idBad = pats.some(function (p, i) { return at(p, 'Id') !== String(i); });
    if (idBad) add('P_ID', 'Корпуса', patsNode ? patsNode.ln : 0, 'Id корпусов должны идти 0..' + (pats.length - 1) + ' по позиции (спецификация DipTrace, разд. 5) — перенумерация', function () { model(L.doc).patterns.forEach(function (p, i) { setA(p, 'Id', i); }); });
    if (L.kind === 'e') {
      var stl = {};
      pats.forEach(function (p, i) {
        var s = at(p, 'PatternStyle') || at(p, 'PatternType');
        if (!s || stl[s]) { add('P_STYLE', patLabel(p, i), p.ln, s ? 'PatternStyle «' + s + '» повторяется — будет новое уникальное имя' : 'Нет PatternStyle — будет назначено', function () { var k = 0, nn; var used = {}; model(L.doc).patterns.forEach(function (q) { used[at(q, 'PatternStyle') || at(q, 'PatternType')] = 1; }); do { nn = 'PatFix' + (k++); } while (used[nn]); delA(p, 'PatternType'); setA(p, 'PatternStyle', nn); }); }
        else stl[s] = 1;
      });
    }
    var names = {}, catRefs = [];
    pats.forEach(function (p, i) {
      var lb = patLabel(p, i), nm = txt(p, 'Name');
      if (!nm) add('P_NONAME', lb, p.ln, 'Нет <Name> — будет NONAME_' + i, function () { X.setTxt(p, 'Name', 'NONAME_' + i); reorder(p, PAD_ORDER); });
      else { if (names[nm]) add('P_DUPNAME', lb, p.ln, 'Имя уже у ' + names[nm], null); else names[nm] = '#' + i; }
      dupChildren(p, PAT_SINGLE, lb, add);
      orderCheck(p, PAD_ORDER, lb, add);
      var mt = at(p, 'Mounting'), padsN = kid(p, 'Pads'), pads = kids(padsN, 'Pad');
      function guessMount() { var th = 0, sm = 0; pads.forEach(function (d) { var s = styleSet[at(d, 'Style')]; if (s && at(s, 'Type') === 'Through') th++; else sm++; }); return th && sm ? 'Mixed' : th ? 'Through' : 'SMD'; }
      if (mt === 'None') add('P_MOUNTNONE', lb, p.ln, 'Mounting="None" — по площадкам будет ' + guessMount(), function () { setA(p, 'Mounting', guessMount()); });
      else if (MOUNT.indexOf(mt) < 0) add('P_MOUNT', lb, p.ln, 'Mounting="' + mt + '" — по площадкам будет ' + guessMount(), function () { setA(p, 'Mounting', guessMount()); });
      var ty = at(p, 'Type');
      if (ty != null && PTYPE.indexOf(ty) < 0) add('P_TYPE', lb, p.ln, 'Type="' + ty + '" — будет Free', function () { setA(p, 'Type', 'Free'); });
      if (ty === 'Lines' && isInt(at(p, 'Int2')) && +at(p, 'Int2') !== pads.length) add('P_TPL', lb, p.ln, 'Шаблон Lines: Int1=' + at(p, 'Int1') + ', Int2=' + at(p, 'Int2') + ', а площадок ' + pads.length + ' (похоже на копию другого корпуса) — будет Type="Free", геометрия не меняется', function () { setA(p, 'Type', 'Free'); setA(p, 'LockTypeChange', 'N'); ['Float1', 'Float2', 'Float3', 'Int1', 'Int2'].forEach(function (k) { if (at(p, k) != null) setA(p, k, '0'); }); });
      var ori = at(p, 'Orientation'); if (ori != null && ORI.indexOf(ori) < 0) add('P_ORIENT', lb, p.ln, 'Orientation="' + ori + '" — будет 0', function () { setA(p, 'Orientation', '0'); });
      var dp = kid(p, 'DefPad'), dps = dp && at(dp, 'Style');
      function fallbackStyle() { var cnt = {}; pads.forEach(function (d) { var s = at(d, 'Style'); if (styleSet[s]) cnt[s] = (cnt[s] || 0) + 1; }); var best = null; for (var k in cnt) if (!best || cnt[k] > cnt[best]) best = k; return best || firstStyle; }
      if (!dp || !styleSet[dps]) {
        if (firstStyle) add('P_DEFPAD', lb, dp ? dp.ln : p.ln, (dp ? 'DefPad Style="' + dps + '" не найден' : 'Нет <DefPad>') + ' — будет «' + fallbackStyle() + '»', function () { var s = fallbackStyle(); if (dp) setA(dp, 'Style', s); else { p.c.push(el('DefPad', [['Style', s]])); reorder(p, PAD_ORDER); } });
      } else styleUse[dps] = 1;
      var pidSeen = {}, pidBad = false, padIds = {};
      pads.forEach(function (d) {
        var s = at(d, 'Style'), id = at(d, 'Id');
        if (!isInt(id) || pidSeen[id]) pidBad = true; pidSeen[id] = 1; padIds[id] = d;
        if (!styleSet[s]) { add('P_PADSTYLE', lb, d.ln, 'Площадка Id=' + id + ' №' + txt(d, 'Number') + ' Style="' + s + '" — будет стиль DefPad', function () { var dd = kid(p, 'DefPad'); var ns = dd && styleSet[at(dd, 'Style')] ? at(dd, 'Style') : fallbackStyle(); setA(d, 'Style', ns); }); }
        else styleUse[s] = 1;
        if (!txt(d, 'Number')) add('P_PADNUM', lb, d.ln, 'Площадка Id=' + id + ' без <Number>', null);
        var sd = at(d, 'Side'); if (sd != null && sd !== 'Top' && sd !== 'Bottom') add('P_PADSIDE', lb, d.ln, 'Площадка Id=' + id + ' Side="' + sd + '" — будет Top', function () { setA(d, 'Side', 'Top'); });
      });
      if (pidBad) add('P_PADID', lb, padsN.ln, 'Id площадок повторяются или нечисловые — перенумерация 1..N' + (L.kind === 'e' ? ' и перепривязка выводов по номеру' : ''), function () { var mp = {}; kids(kid(p, 'Pads'), 'Pad').forEach(function (d, k) { setA(d, 'Id', k + 1); }); p._repin = true; });
      if (!pads.length && !kids(kid(p, 'Shapes')).length) add('P_NOPADS', lb, p.ln, 'Пустой корпус: нет площадок и фигур', null);
      var npts = 0; p.c.forEach(function cnt(n) { if (n.t === 'Point') npts++; n.c.forEach(cnt); });
      if (pads.length > 5000 || npts > 50000) add('N_COUNT', lb, p.ln, 'Площадок ' + pads.length + ', точек ' + npts, null);
      var groupIds = {}; kids(kid(p, 'Groups'), 'Group').forEach(function (g) { groupIds[at(g, 'Id')] = 1; });
      pads.forEach(function (d) { var g = at(d, 'Group'); if (g != null && g !== '-1' && !groupIds[g]) add('G_GROUP', lb, d.ln, 'Площадка Id=' + at(d, 'Id') + ' Group=' + g + ' — будет снята', function () { delA(d, 'Group'); }); });
      checkShapes(p, lb, add, 'p', padIds, groupIds);
      var holes = kids(kid(p, 'Holes'), 'Hole'), hs = {}, hb = false; holes.forEach(function (h) { var id = at(h, 'Id'); if (!isInt(id) || hs[id]) hb = true; hs[id] = 1; });
      if (hb) add('G_HOLEID', lb, kid(p, 'Holes').ln, 'Id отверстий повторяются — перенумерация 1..N', function () { kids(kid(p, 'Holes'), 'Hole').forEach(function (h, k) { setA(h, 'Id', k + 1); }); });
      var shapeIds = {}; kids(kid(p, 'Shapes'), 'Shape').forEach(function (s) { shapeIds[at(s, 'Id')] = 1; });
      var dims = kid(p, 'Dimensions');
      kids(dims, 'Dimension').forEach(function (dm) {
        var bad = [];
        ['1', '2'].forEach(function (k) {
          var cn = at(dm, 'Connected' + k), ob = at(dm, 'Object' + k); if (ob == null || ob === '-1') return;
          var ok = cn === 'Pad' ? (padIds[ob] || pads[+ob]) : cn === 'Shape' ? shapeIds[ob] : cn === 'Hole' ? (hs[ob] || holes[+ob]) : true;
          if (!ok) bad.push(cn + ' ' + ob);
        });
        if (bad.length) add('G_DIMREF', lb, dm.ln, 'Размер ссылается на ' + bad.join(', ') + ' — размер будет удалён', function () { X.remove(dims, dm); });
      });
      var cat = kid(p, 'Category'); if (cat) catRefs.push({ cat: cat, owner: p, label: lb });
      checkAddFields(p, lb, add);
      var m3 = kid(p, 'Model3D');
      if (!m3) add('M_NONE', lb, p.ln, 'Нет <Model3D> (DipTrace пишет его всегда) — будет пустой блок', function () { p.c.push(defModel3D()); reorder(p, PAD_ORDER); });
      else checkModel(m3, lb, add, opt);
    });
    checkCats(kid(pl, 'Categories'), catRefs, 'p', add);
    var unused = Object.keys(styleSet).filter(function (k) { return !styleUse[k]; });
    if (unused.length) add('S_UNUSED', 'Стили площадок', ps ? ps.ln : 0, 'Не используются: ' + unused.join(', ') + ' — будут удалены', function () { unused.forEach(function (k) { X.remove(ps, styleSet[k]); }); });
  }
  function defModel3D() {
    return el('Model3D', [['Mirror', 'N'], ['NoSearch', 'N'], ['Units', 'mm'], ['IPC_XOff', '0'], ['IPC_YOff', '0'], ['AutoHeight', '0'], ['AutoColor', '4934475'], ['Type', 'File'], ['KeepPins', 'N']],
      [el('Rotate', [['X', '0'], ['Y', '0'], ['Z', '0']]), el('Offset', [['X', '0'], ['Y', '0'], ['Z', '0']]), el('Zoom', [['X', '1'], ['Y', '1'], ['Z', '1']])]);
  }
  function modelPaths(m3) { var f = kid(m3, 'Filename'); return { f: f, path: f ? txt(f, 'Path') : '', vr: f ? txt(f, 'Var') : '' }; }
  function checkModel(m3, lb, add, opt) {
    var u = at(m3, 'Units'), ty = at(m3, 'Type');
    if ((u != null && ['mm', 'mil', 'inch', 'Wings'].indexOf(u) < 0) || (ty != null && ['File', 'IPC-7351', 'Outline'].indexOf(ty) < 0)) add('M_ENUM', lb, m3.ln, 'Model3D Units="' + u + '" Type="' + ty + '" — будут mm/File', function () { if (['mm', 'mil', 'inch', 'Wings'].indexOf(u) < 0) setA(m3, 'Units', 'mm'); if (['File', 'IPC-7351', 'Outline'].indexOf(ty) < 0) setA(m3, 'Type', 'File'); });
    var z = kid(m3, 'Zoom'); if (z && ['X', 'Y', 'Z'].some(function (k) { return num(at(z, k)) === 0; })) add('M_ZOOM', lb, z.ln, 'Zoom X/Y/Z = ' + ['X', 'Y', 'Z'].map(function (k) { return at(z, k); }).join('/') + ' — нули заменяются на 1', function () { ['X', 'Y', 'Z'].forEach(function (k) { if (num(at(z, k)) === 0) setA(z, k, '1'); }); });
    var mp = modelPaths(m3);
    if (ty === 'File' && !mp.path && !mp.vr) { add('M_NOFILE', lb, m3.ln, 'Модель не назначена', null); return; }
    if (/^\\\\/.test(mp.path) || /^\\\\/.test(mp.vr)) add('M_UNC', lb, m3.ln, mp.path || mp.vr, null);
    if (opt.models && (mp.path || mp.vr)) {
      var r = resolveModel(mp, opt.models);
      if (r.state === 'missing') add('M_MISSING', lb, m3.ln, (mp.vr || mp.path) + ' — ссылка на файл будет удалена', function () { if (mp.f) X.remove(m3, mp.f); });
      else if (r.state === 'ok' && opt.models[r.key] && opt.models[r.key].cloud && opt.models[r.key].cloud.has(r.rel)) add('M_CLOUD', lb, m3.ln, (mp.vr || mp.path) + ' — отметьте папку «Всегда хранить на этом устройстве»', null);
    }
  }
  // opt.models: {my:{prefixes:[], set:Set}, main:{prefixes:[], set:Set}}
  function resolveModel(mp, M) {
    var cands = [mp.vr, mp.path].filter(Boolean);
    for (var i = 0; i < cands.length; i++) {
      var p = cands[i].replace(/\//g, '\\');
      var low = p.toLowerCase();
      var roots = [['my', '%my3dmodels%\\'], ['main', '%maindir%\\models3d\\']];
      for (var r = 0; r < roots.length; r++) { var R = M[roots[r][0]]; if (low.indexOf(roots[r][1]) === 0 && R && R.set) return { state: R.set.has(low.slice(roots[r][1].length)) ? 'ok' : 'missing', rel: low.slice(roots[r][1].length), key: roots[r][0] }; }
      for (var key in M) { var Q = M[key]; if (!Q || !Q.set) continue; for (var j = 0; j < Q.prefixes.length; j++) { var pre = Q.prefixes[j].toLowerCase().replace(/\//g, '\\'); if (pre && pre.slice(-1) !== '\\') pre += '\\'; if (pre && low.indexOf(pre) === 0) return { state: Q.set.has(low.slice(pre.length)) ? 'ok' : 'missing', rel: low.slice(pre.length), key: key }; } }
    }
    return { state: 'unknown' };
  }

  // ---------- компоненты ----------
  function padIndexOf(pattern) {
    var pads = kids(kid(pattern, 'Pads'), 'Pad'), byId = {}, byNum = {};
    pads.forEach(function (d, i) { byId[at(d, 'Id')] = d; var n = txt(d, 'Number'); if (!(n in byNum)) byNum[n] = { d: d, i: i }; });
    return { pads: pads, byId: byId, byNum: byNum };
  }
  function detectPinConv(L, patByStyle) {
    // сколько выводов совпадает по Id площадки, а сколько — по позиции в массиве
    var id = 0, ix = 0, ix1 = 0;
    L.components.forEach(function (c) {
      var P1 = kid(c, 'Part'), pr = P1 && kid(P1, 'Pattern'), st = pr && (at(pr, 'Style') || at(pr, 'PatternType')), pat = st && patByStyle[st];
      if (!pat) return; var PI = pat._pi || (pat._pi = padIndexOf(pat));
      kids(c, 'Part').forEach(function (P) { kids(kid(P, 'Pins'), 'Pin').forEach(function (pn) { var k = at(pn, 'PadId'), nm = txt(pn, 'PadNumber'); if (k == null || k === '-1' || !nm) return; if (PI.byId[k] && txt(PI.byId[k], 'Number') === nm) id++; if (PI.pads[+k] && txt(PI.pads[+k], 'Number') === nm) ix++; }); });
    });
    return ix > id ? 'index' : 'id';
  }
  function checkComp(L, add, opt) {
    var root = L.root, comps = L.components, compsNode = kid(root, 'Components');
    var patByStyle = {}; L.patterns.forEach(function (p) { var s = at(p, 'PatternStyle') || at(p, 'PatternType'); if (s && !patByStyle[s]) patByStyle[s] = p; delete p._pi; });
    var conv = detectPinConv(L, patByStyle), used = {};
    var subf = kids(kid(root, 'SubFolders'), 'Item').length;
    if (comps.some(function (c, i) { return at(c, 'Id') !== String(i); })) add('E_CID', 'Компоненты', compsNode ? compsNode.ln : 0, 'Id компонентов должны идти 0..' + (comps.length - 1) + ' — перенумерация', function () { model(L.doc).components.forEach(function (c, i) { setA(c, 'Id', i); }); });
    var names = {}, catRefs = [];
    comps.forEach(function (c, ci) {
      var lb = compLabel(c, ci), parts = kids(c, 'Part');
      if (!parts.length) { add('E_NOPART', lb, c.ln, 'Нет ни одной части — компонент будет удалён', function () { X.remove(kid(L.root, 'Components'), c); }); return; }
      var nm = txt(parts[0], 'Name'); if (nm) { if (names[nm]) add('E_DUPNAME', lb, c.ln, 'Имя уже у ' + names[nm], null); else names[nm] = '#' + ci; }
      if (parts.some(function (P, i) { return at(P, 'Id') !== String(i); })) add('E_PID', lb, c.ln, 'Id частей не 0..' + (parts.length - 1) + ' — перенумерация', function () { kids(c, 'Part').forEach(function (P, i) { setA(P, 'Id', i); }); });
      var P1 = parts[0], pr = kid(P1, 'Pattern'), st = pr && (at(pr, 'Style') || at(pr, 'PatternType')), pat = null;
      if (pr && st) { pat = patByStyle[st]; if (!pat) add('E_PATREF', lb, pr.ln, 'Pattern Style="' + st + '" нет во вложенной библиотеке — ссылка будет удалена (компонент без корпуса)', function () { X.remove(P1, pr); }); else used[st] = 1; }
      var PI = pat ? (pat._pi || (pat._pi = padIndexOf(pat))) : null;
      parts.forEach(function (P, pi) {
        var plb = lb + (parts.length > 1 ? ' / часть ' + pi : '');
        dupChildren(P, PART_SINGLE, plb, add);
        orderCheck(P, PART_ORDER, plb, add);
        var pt = at(P, 'PartType'), tt = at(P, 'Type');
        if ((pt != null && PARTTYPE.indexOf(pt) < 0) || (tt != null && PARTTPL.indexOf(tt) < 0)) add('E_ENUM', plb, P.ln, 'PartType="' + pt + '" Type="' + tt + '" — будут Normal/Free', function () { if (PARTTYPE.indexOf(pt) < 0) setA(P, 'PartType', 'Normal'); if (PARTTPL.indexOf(tt) < 0) setA(P, 'Type', 'Free'); });
        var sfi = at(P, 'SubFolderIndex'); if (sfi != null && sfi !== '-1' && (!isInt(sfi) || +sfi >= subf || +sfi < 0)) add('E_SUBF', plb, P.ln, 'SubFolderIndex=' + sfi + ', подпапок ' + subf + ' — будет -1', function () { setA(P, 'SubFolderIndex', '-1'); });
        var pins = kids(kid(P, 'Pins'), 'Pin');
        if (pins.some(function (pn, i) { return at(pn, 'Id') !== String(i); })) add('E_PINID', plb, kid(P, 'Pins').ln, 'Id выводов не 0..' + (pins.length - 1) + ' — перенумерация', function () { kids(kid(P, 'Pins'), 'Pin').forEach(function (pn, i) { setA(pn, 'Id', i); }); });
        var groupIds = {}; kids(kid(P, 'Groups'), 'Group').forEach(function (g) { groupIds[at(g, 'Id')] = 1; });
        pins.forEach(function (pn) {
          var o = at(pn, 'Orientation'), ty = at(pn, 'Type'), et = at(pn, 'ElectricType');
          if ((o != null && ORI.indexOf(o) < 0) || (ty != null && PINTYPE.indexOf(ty) < 0) || (et != null && ELTYPE.indexOf(et) < 0)) add('E_PINENUM', plb, pn.ln, 'Вывод Id=' + at(pn, 'Id') + ': Orientation=' + o + ' Type=' + ty + ' ElectricType=' + et + ' — недопустимые заменяются 0/Default/Undefined', function () { if (o != null && ORI.indexOf(o) < 0) setA(pn, 'Orientation', '0'); if (ty != null && PINTYPE.indexOf(ty) < 0) setA(pn, 'Type', 'Default'); if (et != null && ELTYPE.indexOf(et) < 0) setA(pn, 'ElectricType', 'Undefined'); });
          var g = at(pn, 'Group'); if (g != null && g !== '-1' && !groupIds[g]) add('G_GROUP', plb, pn.ln, 'Вывод Id=' + at(pn, 'Id') + ' Group=' + g + ' — будет снята', function () { delA(pn, 'Group'); });
          if (!PI) return;
          var k = at(pn, 'PadId'), num_ = txt(pn, 'PadNumber');
          if (k == null || k === '-1') return;
          var hit = conv === 'index' ? PI.pads[+k] : PI.byId[k];
          var okHit = hit && (!num_ || txt(hit, 'Number') === num_);
          if (okHit) return;
          var target = num_ ? PI.byNum[num_] : null;
          if (target) add('E_PINPAD', plb, pn.ln, 'Вывод «' + txt(pn, 'Name') + '» PadId=' + k + ' не указывает на площадку №' + num_ + ' — будет PadId=' + (conv === 'index' ? target.i : at(target.d, 'Id')), function () { var PI2 = padIndexOf(pat), t2 = PI2.byNum[num_]; if (t2) setA(pn, 'PadId', conv === 'index' ? t2.i : at(t2.d, 'Id')); });
          else if (!hit) add('E_PINPAD', plb, pn.ln, 'Вывод «' + txt(pn, 'Name') + '» PadId=' + k + ' — площадки нет' + (num_ ? ', номера «' + num_ + '» тоже нет' : '') + ' — вывод будет отвязан (PadId=-1)', function () { setA(pn, 'PadId', '-1'); });
          else add('E_PINNOPAD', plb, pn.ln, 'Вывод «' + txt(pn, 'Name') + '»: PadNumber «' + num_ + '» нет в корпусе', null);
        });
        checkShapes(P, plb, add, 'c', null, groupIds);
        var cat = kid(P, 'Category'); if (cat && pi === 0) catRefs.push({ cat: cat, owner: P, label: plb });
        if (pi === 0) checkAddFields(P, plb, add);
        var ic = kid(P, 'InternalConnections');
        if (ic) kids(ic, 'IntCon').forEach(function (x) {
          var a = at(x, 'X'), b = at(x, 'Y');
          var okA = PI && (PI.byId[a]), okB = PI && (PI.byId[b]);
          if (!PI || !okA || !okB) add('E_INTCON', plb, x.ln, 'IntCon X=' + a + ' Y=' + b + (PI ? '' : ' (у компонента нет корпуса)') + ' — соединение будет удалено', function () { X.remove(ic, x); if (!ic.c.length) X.remove(P, ic); });
        });
      });
      // перепривязка выводов после перенумерации площадок
      if (pat && pat._repin) { /* обрабатывается в apply */ }
    });
    checkCats(kid(root, 'Categories'), catRefs, 'e', add);
    var unusedPats = L.patterns.filter(function (p) { var s = at(p, 'PatternStyle') || at(p, 'PatternType'); return !used[s]; });
    if (unusedPats.length) add('E_UNUSEDPAT', 'Вложенные корпуса', 0, unusedPats.length + ' шт.: ' + unusedPats.slice(0, 8).map(function (p) { return txt(p, 'Name'); }).join(', ') + (unusedPats.length > 8 ? '…' : '') + ' — будут удалены', function () { var pn = kid(L.pl, 'Patterns'); unusedPats.forEach(function (p) { X.remove(pn, p); }); kids(pn, 'Pattern').forEach(function (p, i) { setA(p, 'Id', i); }); });
    L.pinConv = conv;
  }

  // ---------- применение ----------
  var ORDER = ['X_', 'R_', 'S_DUP', 'S_', 'E_NOPART', 'P_DUPCHILD', 'P_STYLE', 'E_PATREF', 'E_UNUSEDPAT', 'N_', 'P_PADID', 'P_', 'G_', 'F_', 'M_', 'C_', 'E_', 'P_ID', 'E_CID', 'P_ORDER'];
  function rank(code) { var best = -1, bl = 0; ORDER.forEach(function (o, i) { if (code.indexOf(o) === 0 && o.length >= bl) { best = i; bl = o.length; } }); return best < 0 ? 99 : best; }
  function apply(doc, enabled, opt) {
    // enabled: {code:true}; повторные проходы, пока исправления находятся
    var log = [];
    for (var pass = 0; pass < 4; pass++) {
      var iss = check({ root: doc.root, issues: [] }, opt).filter(function (q) { return q.fix && enabled[q.code]; });
      if (!iss.length) break;
      iss.sort(function (a, b) { return rank(a.code) - rank(b.code); });
      // исправления одного прохода с одинаковой областью (перенумерации) достаточно применить по разу
      var once = {};
      iss.forEach(function (q) {
        var key = (q.code === 'P_ID' || q.code === 'E_CID' || q.code === 'C_TREE' || q.code === 'S_UNUSED' || q.code === 'E_UNUSEDPAT') ? q.code : null;
        if (key) { if (once[key]) return; once[key] = 1; }
        try { q.fix(); log.push({ pass: pass + 1, code: q.code, obj: q.obj, ln: q.ln, msg: q.msg }); } catch (e) { log.push({ pass: pass + 1, code: q.code, obj: q.obj, ln: q.ln, msg: 'ОШИБКА исправления: ' + e.message }); }
      });
      // перепривязка выводов для корпусов с перенумерованными площадками
      var L = model(doc);
      if (L.kind === 'e') {
        var conv = L.pinConv || 'id', byStyle = {};
        L.patterns.forEach(function (p) { var s = at(p, 'PatternStyle') || at(p, 'PatternType'); if (s) byStyle[s] = p; });
        L.components.forEach(function (c) {
          var P1 = kid(c, 'Part'), pr = P1 && kid(P1, 'Pattern'), st = pr && at(pr, 'Style'), pat = st && byStyle[st];
          if (!pat || !pat._repin) return; var PI = padIndexOf(pat);
          kids(c, 'Part').forEach(function (P) { kids(kid(P, 'Pins'), 'Pin').forEach(function (pn) { var t = PI.byNum[txt(pn, 'PadNumber')]; if (t) setA(pn, 'PadId', conv === 'index' ? t.i : at(t.d, 'Id')); }); });
        });
      }
      L.patterns.forEach(function (p) { delete p._repin; delete p._pi; });
    }
    return log;
  }

  // ---------- подмножества для поиска причины ----------
  function items(doc, mode) {
    var L = model(doc);
    if (L.kind === 'l' || mode === 'pat') return L.patterns.map(function (p, i) { return { i: i, name: txt(p, 'Name'), kind: 'pat' }; });
    return L.components.map(function (c, i) { var P = kid(c, 'Part'); return { i: i, name: txt(P, 'Name'), kind: 'comp', style: P && kid(P, 'Pattern') ? at(kid(P, 'Pattern'), 'Style') : null }; });
  }
  function rndUID() { return String(Math.floor(Math.random() * 2147483647)); }
  function subset(doc, mode, keep, tag) {
    var d = { root: X.clone(doc.root), decl: doc.decl, nl: doc.nl, bom: true, issues: [] };
    var L = model(d), set = {}; keep.forEach(function (k) { set[k] = 1; });
    if (L.kind === 'l' || mode === 'pat') {
      var pn = kid(L.pl, 'Patterns'), kept = {};
      pn.c = pn.c.filter(function (p, i) { if (p.t !== 'Pattern') return true; var ok = !!set[i]; if (ok) kept[at(p, 'PatternStyle')] = 1; return ok; });
      kids(pn, 'Pattern').forEach(function (p, i) { setA(p, 'Id', i); });
      if (L.kind === 'e') { var cn = kid(L.root, 'Components'); cn.c = cn.c.filter(function (c) { var P = kid(c, 'Part'), pr = P && kid(P, 'Pattern'); return !pr || kept[at(pr, 'Style')]; }); kids(cn, 'Component').forEach(function (c, i) { setA(c, 'Id', i); }); }
    } else {
      var cn2 = kid(L.root, 'Components'), styles = {};
      var idx = 0; cn2.c = cn2.c.filter(function (c) { if (c.t !== 'Component') return true; var ok = !!set[idx++]; if (ok) { var P = kid(c, 'Part'), pr = P && kid(P, 'Pattern'); if (pr) styles[at(pr, 'Style')] = 1; } return ok; });
      kids(cn2, 'Component').forEach(function (c, i) { setA(c, 'Id', i); });
      var pn2 = kid(L.pl, 'Patterns'); if (pn2) { pn2.c = pn2.c.filter(function (p) { return p.t !== 'Pattern' || styles[at(p, 'PatternStyle')]; }); kids(pn2, 'Pattern').forEach(function (p, i) { setA(p, 'Id', i); }); }
    }
    if (tag) { setA(d.root, 'Name', (at(d.root, 'Name') || '') + ' ' + tag); setA(d.root, 'UID32', rndUID()); }
    return d;
  }
  // варианты «без X» для проверки гипотез
  var ABL = [
    { k: 'no3d', t: 'без ссылок на 3D-модели', f: function (L) { eachPattern(L, function (p) { var m = kid(p, 'Model3D'); if (m) { var f = kid(m, 'Filename'); if (f) X.remove(m, f); } }); } },
    { k: 'nofields', t: 'без пользовательских полей', f: function (L) { eachOwner(L, function (o) { var a = kid(o, 'AddFields'); if (a) X.remove(o, a); }); } },
    { k: 'nocat', t: 'без категорий', f: function (L) { eachOwner(L, function (o) { var a = kid(o, 'Category'); if (a) X.remove(o, a); }); [L.pl, L.kind === 'e' ? L.root : null].forEach(function (n) { if (!n) return; var c = kid(n, 'Categories'); if (c) { c.c = []; c.x = null; c.sc = ' />'; } }); } },
    { k: 'norc', t: 'без RecoveryCode (данных генератора IPC)', f: function (L) { eachPattern(L, function (p) { var a = kid(p, 'RecoveryCode'); if (a) X.remove(p, a); }); } },
    { k: 'free', t: 'все шаблоны → Free', f: function (L) { eachPattern(L, function (p) { if (at(p, 'Type') !== 'Free') { setA(p, 'Type', 'Free'); setA(p, 'LockTypeChange', 'N'); ['Float1', 'Float2', 'Float3', 'Int1', 'Int2'].forEach(function (k) { if (at(p, k) != null) setA(p, k, '0'); }); } }); } },
    { k: 'notext', t: 'без текстовых фигур', f: function (L) { eachOwner(L, function (o) { var s = kid(o, 'Shapes'); if (s) s.c = s.c.filter(function (x) { return at(x, 'Type') !== 'Text'; }); }); } },
    { k: 'nodim', t: 'без размеров, групп и отверстий', f: function (L) { eachPattern(L, function (p) { ['Dimensions', 'Groups', 'Holes'].forEach(function (t) { var a = kid(p, t); if (a) X.remove(p, a); }); kids(kid(p, 'Pads'), 'Pad').forEach(function (d) { delA(d, 'Group'); }); kids(kid(p, 'Shapes'), 'Shape').forEach(function (d) { delA(d, 'Group'); }); }); } },
    { k: 'nometa', t: 'без Datasheet, PossibleNames, Suppliers, Name_Unique/Description', f: function (L) { eachOwner(L, function (o) { ['Datasheet', 'PossibleNames', 'Suppliers', 'Name_Unique', 'Name_Description', 'LibPath', 'SpiceModel'].forEach(function (t) { var a = kid(o, t); if (a) X.remove(o, a); }); }); } },
    { k: 'mount', t: 'Mounting="None" → по площадкам', f: function (L) { var ss = {}; kids(kid(L.pl, 'PadStyles'), 'PadStyle').forEach(function (s) { ss[at(s, 'Name')] = at(s, 'Type'); }); eachPattern(L, function (p) { if (MOUNT.indexOf(at(p, 'Mounting')) >= 0) return; var th = 0, sm = 0; kids(kid(p, 'Pads'), 'Pad').forEach(function (d) { if (ss[at(d, 'Style')] === 'Through') th++; else sm++; }); setA(p, 'Mounting', th && sm ? 'Mixed' : th ? 'Through' : 'SMD'); }); } }
  ];
  function eachPattern(L, fn) { L.patterns.forEach(fn); }
  function eachOwner(L, fn) { L.patterns.forEach(fn); L.components.forEach(function (c) { kids(c, 'Part').forEach(fn); }); }
  function ablate(doc, keys, tag) {
    var d = { root: X.clone(doc.root), decl: doc.decl, nl: doc.nl, bom: true, issues: [] }, L = model(d);
    ABL.forEach(function (a) { if (keys.indexOf(a.k) >= 0) a.f(L); });
    if (tag) { setA(d.root, 'Name', (at(d.root, 'Name') || '') + ' ' + tag); setA(d.root, 'UID32', rndUID()); }
    return d;
  }

  function stats(doc) {
    var L = model(doc), s = { kind: L.kind, type: L.type, units: L.units, version: at(doc.root, 'Version') || '', name: at(doc.root, 'Name') || '', patterns: L.patterns.length, components: L.components.length, styles: kids(kid(L.pl, 'PadStyles'), 'PadStyle').length, pads: 0, shapes: 0, models: 0 };
    L.patterns.forEach(function (p) { s.pads += kids(kid(p, 'Pads'), 'Pad').length; s.shapes += kids(kid(p, 'Shapes'), 'Shape').length; var m = kid(p, 'Model3D'); if (m && kid(m, 'Filename')) s.models++; });
    return s;
  }
  function modelList(doc) {
    var L = model(doc), r = [];
    L.patterns.forEach(function (p, i) { var m = kid(p, 'Model3D'); if (!m) return; var mp = modelPaths(m); if (mp.path || mp.vr) r.push({ i: i, name: txt(p, 'Name'), path: mp.path, vr: mp.vr }); });
    return r;
  }

  function modelReport(doc, M) {
    var r = { total: 0, ok: 0, missing: 0, cloud: 0, unknown: 0, unc: 0, list: [] };
    modelList(doc).forEach(function (x) {
      r.total++; var st = M ? resolveModel(x, M) : { state: 'unknown' }, s = st.state;
      if (s === 'ok' && M[st.key] && M[st.key].cloud && M[st.key].cloud.has(st.rel)) s = 'cloud';
      if (/^\\\\/.test(x.vr || x.path)) r.unc++;
      r[s]++; r.list.push({ i: x.i, name: x.name, ref: x.vr || x.path, state: s, root: st.key || '' });
    });
    return r;
  }
  return { modelReport: modelReport, CODES: CODES, DEFAULT_ON: DEFAULT_ON, check: check, apply: apply, model: model, items: items, subset: subset, ablate: ablate, ABL: ABL, stats: stats, modelList: modelList, resolveModel: resolveModel };
})();
if (typeof module !== 'undefined') module.exports = DC;
