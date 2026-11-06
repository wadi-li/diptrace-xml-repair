import json,pathlib,sys
S=pathlib.Path('src'); out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'dist'); out.mkdir(exist_ok=True)
core=(S/'xml.js').read_text()+'\n'+(S/'checks.js').read_text()+'\n'+(S/'dtdata.js').read_text()
app=(S/'ui.js').read_text()
for c in (core,app): assert '</script' not in c.lower()
ps=(S/'server.ps1').read_text(encoding='utf-8').replace('\r\n','\n')
psj=json.dumps(ps,ensure_ascii=False).replace('</','<\\/').replace('<!--','<\\!--')
h=(S/'app.html').read_text().replace('/*__CMDHDR__*/[]',json.dumps(json.load(open('src/cmd-header.json'))).replace('</','<\\/')).replace('/*__SRVPS__*/""',psj).replace('/*__CORE__*/',core).replace('/*__APP__*/',app)
(out/'diptrace-xml-repair.html').write_text(h,encoding='utf-8')
HDR=json.load(open('src/cmd-header.json'))
hdr="\r\n".join(HDR)
import re
emb=re.sub(r"(?m)^'@", " '@", h)
txt=hdr+"$EMBED_HTML = @'\r\n"+emb+"\r\n'@\r\n"+ps.replace('\n','\r\n')
(out/'DipTrace-XML-Repair.cmd').write_bytes(txt.encode('utf-8'))
print('html',len(h),'cmd',len(txt))

# Корпоративная сборка: без встроенного сервера и без формирования .cmd/.ps1 в браузере; сервер — отдельный файл рядом.
import zipfile
c=out/'corp'; c.mkdir(exist_ok=True)
stubs=iter(["  function makeCmd() { return ''; }\n","  function dlServer() {} function dlPs1() {} function dlReg() {}\n"])
appc=re.sub(r'  /\*CORP-STRIP-BEGIN\*/\n.*?  /\*CORP-STRIP-END\*/\n',lambda m:next(stubs),app,flags=re.S)
assert 'CORP-STRIP' not in appc
hc=(S/'app.html').read_text().replace('/*__CMDHDR__*/[]','[]').replace('/*__CORP__*/false','true').replace('/*__SRVPS__*/""','""').replace('/*__CORE__*/',core).replace('/*__APP__*/',appc)
assert 'TcpListener' not in hc
(c/'diptrace-xml-repair.html').write_text(hc,encoding='utf-8')
(c/'dt-xml-repair-server.ps1').write_bytes(b'\xef\xbb\xbf'+ps.replace('\n','\r\n').encode('utf-8'))
(c/'start-server.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\npowershell -NoProfile -STA -File "%~dp0dt-xml-repair-server.ps1"\r\nif errorlevel 1 pause\r\n')
with zipfile.ZipFile(out/'DipTrace-XML-Repair-corp.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in ('diptrace-xml-repair.html','dt-xml-repair-server.ps1','start-server.cmd'): z.write(c/f,'DipTrace-XML-Repair/'+f)
print('corp ok')
