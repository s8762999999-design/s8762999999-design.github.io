from pathlib import Path
root=Path(__file__).resolve().parent
text=(root/'template.html').read_text(encoding='utf-8')
for marker,name in [('/*__STYLE__*/','style.css'),('/*__CORE__*/','core.js'),('/*__APP__*/','app.js')]:
    text=text.replace(marker,(root/name).read_text(encoding='utf-8'))
(root/'index.html').write_text(text,encoding='utf-8')
print('Built index.html:',len(text.encode('utf-8')),'bytes')
