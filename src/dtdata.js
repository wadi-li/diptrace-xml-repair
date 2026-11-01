// DD — чтение служебных файлов DipTrace (libgroups.dat, libgroups_var.dat): строки UTF-16BE с 2-байтной длиной (BE).
// Формат не документирован; извлекаются только строки, похожие на пути и имена переменных %…%.
var DD = (function () {
  'use strict';
  var PATHLIKE = /^([A-Za-z]:\\|\\\\|%[A-Za-z0-9_]+%)/;
  function strings(b) {
    var out = [], n = b.length, i = 0;
    while (i + 2 < n) {
      var L = (b[i] << 8) | b[i + 1];
      if (L >= 2 && L <= 1024 && i + 2 + 2 * L <= n) {
        var s = '', ok = true;
        for (var k = 0; k < L; k++) {
          var c = (b[i + 2 + 2 * k] << 8) | b[i + 3 + 2 * k];
          if (c < 32 || (c >= 0xD800 && c <= 0xDFFF) || c >= 0xFFFE) { ok = false; break; }
          s += String.fromCharCode(c);
        }
        if (ok) { out.push({ s: s, off: i }); i += 2 + 2 * L; continue; }
      }
      i++;
    }
    return out;
  }
  var isVar = function (s) { return /^%[A-Za-z0-9_]+%$/.test(s); };
  function vars(b) {
    var S = strings(b), v = {};
    for (var i = 0; i + 1 < S.length; i++) if (PATHLIKE.test(S[i].s) && !isVar(S[i].s) && isVar(S[i + 1].s)) v[S[i + 1].s.toLowerCase()] = S[i].s;
    return v;
  }
  var LIBEXT = /\.(eli|lib|elixml|libxml)$/i;
  function expand(p, V) {
    return String(p).replace(/^%([A-Za-z0-9_]+)%/, function (m) { var x = V[m.toLowerCase()]; return x != null ? x.replace(/\\+$/, '') : m; });
  }
  function groups(b, V) {
    var S = strings(b), libs = [], dirs = [], seen = {};
    S.forEach(function (x) {
      var s = x.s; if (!PATHLIKE.test(s) || isVar(s)) return;
      var e = expand(s, V || {}), k = e.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      var item = { raw: s, path: e, ext: (LIBEXT.exec(e) || [, ''])[1].toLowerCase() };
      if (item.ext) libs.push(item); else dirs.push(item);
    });
    return { libs: libs, dirs: dirs };
  }
  return { strings: strings, vars: vars, groups: groups, expand: expand };
})();
if (typeof module !== 'undefined') module.exports = DD;
