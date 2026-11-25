import re
with open("README.md") as f:
    r = f.read()
m = re.search(r'## Tech Stack.*?(?=\n## |<p align="center"><sub>LANGUAGES</sub></p>)', r, re.S)
if m:
    print(m.group()[:800])
else:
    print("NOT FOUND")