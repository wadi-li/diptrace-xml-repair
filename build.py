import re,pathlib
s=pathlib.Path('src')
core=(s/'xml.js').read_text()+'\n'+(s/'checks.js').read_text()
app=(s/'ui.js').read_text()
for c in (core,app): assert '</script' not in c.lower()
h=(s/'app.html').read_text().replace('/*__CORE__*/',core).replace('/*__APP__*/',app)

(pathlib.Path('diptrace-xml-repair.html')).write_text(h,encoding='utf-8')
print(len(h))
