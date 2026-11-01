import json,pathlib,sys
s=pathlib.Path('src'); out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'dist'); out.mkdir(exist_ok=True)
core=(s/'xml.js').read_text()+'\n'+(s/'checks.js').read_text()+'\n'+(s/'dtdata.js').read_text()
app=(s/'ui.js').read_text()
for c in (core,app): assert '</script' not in c.lower()
ps=(s/'server.ps1').read_text(encoding='utf-8').replace('\r\n','\n')
MK='<'+'#DTR-HTML#'+'>'
assert MK not in ps and MK not in app
psj=json.dumps(ps,ensure_ascii=False).replace('</','<\\/').replace('<!--','<\\!--')
h=(s/'app.html').read_text().replace('/*__SRVPS__*/""',psj).replace('/*__CORE__*/',core).replace('/*__APP__*/',app)
assert MK not in h
(out/'diptrace-xml-repair.html').write_text(h,encoding='utf-8')
hdr="\r\n".join(['<# : DipTrace XML Repair - local server','@echo off','setlocal','set "DTR_DIR=%~dp0"','set "DTR_SELF=%~f0"',
 'title DipTrace XML Repair - local server',
 'powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:DTR_SELF,[Text.Encoding]::UTF8); $i=$t.LastIndexOf(\'<\'+\'#DTR-HTML#\'+\'>\'); if($i -lt 0){$i=$t.Length}; iex $t.Substring(0,$i)"',
 'if errorlevel 1 pause','exit /b','#>',''])
txt=hdr+ps.replace('\n','\r\n')+'\r\n'+MK+'\r\n'+h
(out/'DipTrace-XML-Repair.cmd').write_bytes(txt.encode('utf-8'))
print('html',len(h),'cmd',len(txt))
