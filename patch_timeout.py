import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace('nos primeiros 60s.', 'nos primeiros 12s.')
content = content.replace('}, 60000);', '}, 12000);')

content = content.replace('nos primeiros 20s (servidores ocupados).', 'nos primeiros 12s (servidores ocupados).')
content = content.replace('}, 20000);', '}, 12000);')

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Timeouts patched.")
