/* Терпимый XML-разборщик и сериализатор в стиле DipTrace.
   Узел: {t, a:[[k,v],...], c:[], x:string|null, ln, sc:' />'|'/>'|null, ex:bool} */
var DX = (function () {
  'use strict';
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  var BADCH = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/;

  function decode(s, iss, ln) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)?(;?)/g, function (m, e, semi) {
      if (e && semi) {
        if (e[0] === '#') {
          var cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          if (cp > 0 && cp < 0x110000 && !(cp < 32 && cp !== 9 && cp !== 10 && cp !== 13)) return String.fromCodePoint(cp);
          iss.push({ code: 'X_CHARREF', ln: ln, msg: 'Недопустимая символьная ссылка ' + m + ' — удалена' });
          return '';
        }
        if (ENT.hasOwnProperty(e)) return ENT[e];
      }
      iss.push({ code: 'X_AMP', ln: ln, msg: 'Неэкранированный или неизвестный «' + m + '» — сохранён как текст' });
      return m;
    });
  }

  function parse(src) {
    var iss = [], bom = false;
    if (src.charCodeAt(0) === 0xFEFF) { bom = true; src = src.slice(1); }
    var nCRLF = 0, nLF = 0, nCR = 0;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charCodeAt(i);
      if (ch === 13) { if (src.charCodeAt(i + 1) === 10) { nCRLF++; i++; } else nCR++; }
      else if (ch === 10) nLF++;
    }
    var nl = nCRLF >= nLF ? '\r\n' : '\n';
    if ((nCRLF && nLF) || nCR) iss.push({ code: 'X_NL', ln: 0, msg: 'Смешанные переводы строк: CRLF ' + nCRLF + ', LF ' + nLF + ', CR ' + nCR });
    // управляющие символы
    if (BADCH.test(src)) {
      var cnt = 0, first = 0, line = 1;
      for (var j = 0; j < src.length; j++) {
        var c = src.charCodeAt(j);
        if (c === 10) line++;
        else if ((c < 32 && c !== 9 && c !== 13) || c === 0xFFFE || c === 0xFFFF) { cnt++; if (!first) first = line; }
      }
      iss.push({ code: 'X_CTRL', ln: first, msg: 'Недопустимые управляющие символы: ' + cnt + ' шт. (первый в строке ' + first + ') — удалены' });
      src = src.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
    }
    var pos = 0, ln = 1, lnPos = 0, decl = null, root = null, stack = [], N = src.length, extraRoots = 0;
    function lineAt(p) { while (lnPos < p) { var k = src.indexOf('\n', lnPos); if (k < 0 || k >= p) { lnPos = p; break; } ln++; lnPos = k + 1; } return ln; }
    function addText(t, p) {
      if (!stack.length) { if (/\S/.test(t)) iss.push({ code: 'X_OUTSIDE', ln: lineAt(p), msg: 'Текст вне корневого элемента — удалён' }); return; }
      var top = stack[stack.length - 1];
      if (top.c.length) { if (/\S/.test(t)) { iss.push({ code: 'X_MIXED', ln: lineAt(p), msg: 'Текст между дочерними элементами <' + top.t + '> — удалён' }); } return; }
      top._x = (top._x || '') + t;
    }
    while (pos < N) {
      var lt = src.indexOf('<', pos);
      if (lt < 0) { addText(src.slice(pos), pos); break; }
      if (lt > pos) addText(decode(src.slice(pos, lt), iss, lineAt(pos)), pos);
      var nx = src.charAt(lt + 1);
      if (src.startsWith('<?', lt)) {
        var e1 = src.indexOf('?>', lt); if (e1 < 0) { iss.push({ code: 'X_TRUNC', ln: lineAt(lt), msg: 'Файл обрывается внутри объявления' }); break; }
        var pi = src.slice(lt, e1 + 2); if (/^<\?xml\s/i.test(pi)) { if (decl || root) iss.push({ code: 'X_DECLPOS', ln: lineAt(lt), msg: 'Повторное или позднее объявление XML — удалено' }); else decl = pi; }
        pos = e1 + 2; continue;
      }
      if (src.startsWith('<!--', lt)) {
        var e2 = src.indexOf('-->', lt + 4); if (e2 < 0) { iss.push({ code: 'X_TRUNC', ln: lineAt(lt), msg: 'Незакрытый комментарий до конца файла' }); break; }
        iss.push({ code: 'X_COMMENT', ln: lineAt(lt), msg: 'Комментарий XML — удалён' }); pos = e2 + 3; continue;
      }
      if (src.startsWith('<![CDATA[', lt)) {
        var e3 = src.indexOf(']]>', lt); if (e3 < 0) { iss.push({ code: 'X_TRUNC', ln: lineAt(lt), msg: 'Незакрытый CDATA' }); break; }
        addText(src.slice(lt + 9, e3), lt); iss.push({ code: 'X_CDATA', ln: lineAt(lt), msg: 'Блок CDATA преобразован в экранированный текст' }); pos = e3 + 3; continue;
      }
      if (src.startsWith('<!', lt)) {
        var e4 = src.indexOf('>', lt); iss.push({ code: 'X_DOCTYPE', ln: lineAt(lt), msg: 'DOCTYPE/ENTITY — удалено' }); pos = e4 < 0 ? N : e4 + 1; continue;
      }
      if (!(nx === '/' || /[A-Za-z_:]/.test(nx))) {
        iss.push({ code: 'X_LT', ln: lineAt(lt), msg: 'Неэкранированный «<» в тексте — экранирован' }); addText('<', lt); pos = lt + 1; continue;
      }
      // поиск конца тега с учётом кавычек
      var q = 0, k2 = lt + 1, gt = -1;
      for (; k2 < N; k2++) {
        var cc = src.charCodeAt(k2);
        if (q) { if (cc === q) q = 0; else if (cc === 60 && q) { /* < внутри значения */ } }
        else if (cc === 34 || cc === 39) q = cc;
        else if (cc === 62) { gt = k2; break; }
        else if (cc === 60) { break; }
      }
      var L = lineAt(lt);
      if (gt < 0) {
        iss.push({ code: k2 >= N ? 'X_TRUNC' : 'X_TAG', ln: L, msg: k2 >= N ? 'Файл обрывается внутри тега — хвост отброшен' : 'Тег не закрыт «>» — фрагмент удалён' });
        if (k2 >= N) break; pos = k2; continue;
      }
      var body = src.slice(lt + 1, gt); pos = gt + 1;
      if (body[0] === '/') {
        var name = body.slice(1).trim();
        var at = -1; for (var s = stack.length - 1; s >= 0; s--) if (stack[s].t === name) { at = s; break; }
        if (at < 0) { iss.push({ code: 'X_STRAY', ln: L, msg: 'Лишний закрывающий тег </' + name + '> — удалён' }); continue; }
        while (stack.length - 1 > at) { var u = stack.pop(); iss.push({ code: 'X_UNCLOSED', ln: u.ln, msg: 'Тег <' + u.t + '> не был закрыт — закрыт перед </' + name + '> (стр. ' + L + ')' }); fin(u); }
        fin(stack.pop()); continue;
      }
      var self = false, scs = null;
      if (body[body.length - 1] === '/') { self = true; scs = /\s\/$/.test(body) ? ' />' : '/>'; body = body.slice(0, -1); }
      var m = /^([^\s\/>]+)/.exec(body); var tag = m[1]; var rest = body.slice(tag.length);
      var node = { t: tag, a: [], c: [], x: null, ln: L, sc: scs, ex: false };
      var re = /\s*([^\s=\/>"']+)\s*=\s*("([^"]*)"|'([^']*)')/g, mm, last = 0, seen = {};
      while ((mm = re.exec(rest))) {
        if (mm.index !== last && /\S/.test(rest.slice(last, mm.index))) iss.push({ code: 'X_ATTR', ln: L, msg: 'Мусор в теге <' + tag + '>: «' + rest.slice(last, mm.index).trim().slice(0, 40) + '» — удалён' });
        var key = mm[1], val = decode(mm[3] != null ? mm[3] : mm[4], iss, L);
        if (/[<]/.test(mm[3] || mm[4] || '')) iss.push({ code: 'X_ATTRLT', ln: L, msg: 'Символ «<» в значении атрибута ' + key + ' — экранирован' });
        if (seen[key]) iss.push({ code: 'X_DUPATTR', ln: L, msg: 'Повторный атрибут ' + key + ' в <' + tag + '> — оставлен первый' });
        else { seen[key] = 1; node.a.push([key, val]); }
        last = re.lastIndex;
      }
      if (/\S/.test(rest.slice(last))) iss.push({ code: 'X_ATTR', ln: L, msg: 'Мусор в теге <' + tag + '>: «' + rest.slice(last).trim().slice(0, 40) + '» — удалён' });
      // элемент не может содержать сам себя (кроме Library и Pattern): закрыть открытый одноимённый
      if (tag !== 'Library' && tag !== 'Pattern' && stack.length) {
        var sameAt = -1; for (var s2 = stack.length - 1; s2 >= 0; s2--) if (stack[s2].t === tag) { sameAt = s2; break; }
        if (sameAt >= 0) { while (stack.length > sameAt) { var u3 = stack.pop(); iss.push({ code: 'X_UNCLOSED', ln: u3.ln, msg: 'Тег <' + u3.t + '> не был закрыт — закрыт перед следующим <' + tag + '> (стр. ' + L + ')' }); fin(u3); } }
      }
      if (!stack.length) {
        if (root) { extraRoots++; iss.push({ code: 'X_MULTIROOT', ln: L, msg: 'Второй корневой элемент <' + tag + '> — отброшен' }); if (!self) { /* пропустить поддерево */ stack.push(node); node._drop = true; } continue; }
        root = node;
      } else {
        var par = stack[stack.length - 1];
        if (par._x != null && /\S/.test(par._x)) iss.push({ code: 'X_MIXED', ln: L, msg: 'Текст и дочерние элементы в <' + par.t + '> — текст удалён' });
        par._x = null; par.c.push(node);
      }
      if (!self) stack.push(node);
    }
    while (stack.length) { var u2 = stack.pop(); iss.push({ code: 'X_TRUNC', ln: u2.ln, msg: 'Тег <' + u2.t + '> не закрыт до конца файла — закрыт автоматически (файл, вероятно, обрезан)' }); fin(u2); }
    function fin(n) {
      if (n.c.length === 0 && n.sc == null) {
        if (n._x != null && n._x !== '') n.x = n._x; else { n.x = null; n.ex = true; }
      }
      delete n._x;
    }
    if (!decl) iss.push({ code: 'X_DECL', ln: 1, msg: 'Нет объявления <?xml ...?> — будет добавлено' });
    if (!bom) iss.push({ code: 'X_BOM', ln: 1, msg: 'Нет метки BOM (DipTrace записывает UTF-8 с BOM) — будет добавлена' });
    return { root: root, decl: decl || '<?xml version="1.0" encoding="utf-8"?>', bom: bom, nl: nl, issues: iss };
  }

  function escT(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escA(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function serialize(doc, opt) {
    opt = opt || {};
    var out = [], nl = opt.nl || doc.nl || '\r\n';
    function w(n) {
      var s = '<' + n.t;
      for (var i = 0; i < n.a.length; i++) s += ' ' + n.a[i][0] + '="' + escA(n.a[i][1]) + '"';
      if (n.c.length) { out.push(s + '>'); for (var j = 0; j < n.c.length; j++) w(n.c[j]); out.push('</' + n.t + '>'); }
      else if (n.x != null && n.x !== '') out.push(s + '>' + escT(n.x) + '</' + n.t + '>');
      else if (n.ex && n.sc == null) out.push(s + '></' + n.t + '>');
      else out.push(s + (n.sc != null ? n.sc : (n.a.length || /s$/.test(n.t) ? ' />' : '/>')));
    }
    out.push(doc.decl);
    if (doc.root) w(doc.root);
    var txt = out.join(nl) + nl;
    return (opt.bom === false ? '' : '\uFEFF') + txt;
  }

  // помощники дерева
  function kid(n, t) { if (!n) return null; for (var i = 0; i < n.c.length; i++) if (n.c[i].t === t) return n.c[i]; return null; }
  function kids(n, t) { var r = []; if (!n) return r; for (var i = 0; i < n.c.length; i++) if (!t || n.c[i].t === t) r.push(n.c[i]); return r; }
  function txt(n, t) { var k = kid(n, t); return k ? (k.x || '') : ''; }
  function at(n, k) { if (!n) return null; for (var i = 0; i < n.a.length; i++) if (n.a[i][0] === k) return n.a[i][1]; return null; }
  function setA(n, k, v) { for (var i = 0; i < n.a.length; i++) if (n.a[i][0] === k) { n.a[i][1] = String(v); return; } n.a.push([k, String(v)]); }
  function delA(n, k) { for (var i = 0; i < n.a.length; i++) if (n.a[i][0] === k) { n.a.splice(i, 1); return true; } return false; }
  function el(t, attrs, kids_, x) { return { t: t, a: attrs || [], c: kids_ || [], x: x == null ? null : x, ln: 0, sc: null, ex: false }; }
  function setTxt(n, t, v) { var k = kid(n, t); if (!k) { k = el(t); n.c.push(k); } k.x = v; k.c = []; k.sc = null; k.ex = false; return k; }
  function clone(n) { return JSON.parse(JSON.stringify(n, function (k, v) { return k.charAt(0) === '_' ? undefined : v; })); }
  function remove(par, n) { var i = par.c.indexOf(n); if (i >= 0) par.c.splice(i, 1); }

  return { parse: parse, serialize: serialize, kid: kid, kids: kids, txt: txt, at: at, setA: setA, delA: delA, el: el, setTxt: setTxt, clone: clone, remove: remove };
})();
if (typeof module !== 'undefined') module.exports = DX;
