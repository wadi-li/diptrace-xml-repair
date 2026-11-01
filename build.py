import pathlib
s=pathlib.Path('src')
core=(s/'xml.js').read_text(encoding='utf-8')+'\n'+(s/'checks.js').read_text(encoding='utf-8')+'\n'+(s/'dtdata.js').read_text(encoding='utf-8')
app=(s/'ui.js').read_text(encoding='utf-8')
for c in (core,app): assert '</script' not in c.lower()
h=(s/'app.html').read_text(encoding='utf-8').replace('/*__CORE__*/',core).replace('/*__APP__*/',app)
pathlib.Path('diptrace-xml-repair.html').write_text(h,encoding='utf-8')
hdr="""<# : DipTrace XML Repair - local server
@echo off
setlocal
set "DTR_DIR=%~dp0"
set "DTR_SELF=%~f0"
title DipTrace XML Repair - local server
powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:DTR_SELF))"
if errorlevel 1 pause
exit /b
#>
"""
txt=(hdr+(s/'server.ps1').read_text(encoding='utf-8')).replace('\r\n','\n').replace('\n','\r\n')
pathlib.Path('DipTrace-XML-Repair.cmd').write_bytes(txt.encode('utf-8'))
print(len(h),len(txt))
