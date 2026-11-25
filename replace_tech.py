import re

with open("README.md", "r", encoding="utf-8") as f:
    r = f.read()

new_tech = """### ⚡ Tech Arsenal

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=py,java,c,js,html,css,react,nextjs,nodejs,tailwind,mysql,mongodb&perline=12&theme=dark" /><br/>
    <img src="https://skillicons.dev/icons?i=sklearn,tensorflow,numpy,git,github,vscode,linux,figma,ps,ai,postman,canva&perline=12&theme=dark" />
  </a>
</p>

<details>
  <summary><h2>🛠️ The Full Toolbox (click to expand)</h2></summary>

  <br/>

  <h3>💻 Programming Languages</h3>
  <br/>
  <p align="center">
    <img src="https://img.shields.io/badge/Python-14354C.svg?logo=python&logoColor=white" alt="Python" />
    <img src="https://custom-icon-badges.demolab.com/badge/Java-007396.svg?logo=java&logoColor=white" alt="Java" />
    <img src="https://custom-icon-badges.demolab.com/badge/C-03599C.svg?logo=c-in-hexagon&logoColor=white" alt="C" />
    <img src="https://custom-icon-badges.demolab.com/badge/JavaScript-F7DF1E.svg?logo=javascript&logoColor=black" alt="JavaScript" />
    <img src="https://custom-icon-badges.demolab.com/badge/SQL-025E8C.svg?logo=database&logoColor=white" alt="SQL" />
    <img src="https://custom-icon-badges.demolab.com/badge/HTML-E34F26.svg?logo=html5&logoColor=white" alt="HTML" />
    <img src="https://custom-icon-badges.demolab.com/badge/CSS-1572B6.svg?logo=css3&logoColor=white" alt="CSS" />
  </p>

  <br/>

  <h3>🧰 Frameworks & Libraries</h3>
  <br/>
  <p align="center">
    <img src="https://img.shields.io/badge/React-20232a.svg?logo=react&logoColor=%2361DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Next.js-000000.svg?logo=next.js&logoColor=white" alt="Next.js" />
    <img src="https://img.shields.io/badge/Node.js-43853D.svg?logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Express.js-000000.svg?logo=express&logoColor=white" alt="Express.js" />
    <img src="https://img.shields.io/badge/Tailwind-38B2AC.svg?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/NumPy-013243.svg?logo=numpy&logoColor=white" alt="NumPy" />
    <img src="https://img.shields.io/badge/Pandas-150458.svg?logo=pandas&logoColor=white" alt="Pandas" />
    <img src="https://img.shields.io/badge/scikit--learn-F7931E.svg?logo=scikit-learn&logoColor=white" alt="scikit-learn" />
    <img src="https://img.shields.io/badge/TensorFlow-FF6F00.svg?logo=TensorFlow&logoColor=white" alt="TensorFlow" />
  </p>

  <br/>

  <h3>🗄️ Databases & Cloud</h3>
  <br/>
  <p align="center">
    <img src="https://img.shields.io/badge/MySQL-00f.svg?logo=mysql&logoColor=white" alt="MySQL" />
    <img src="https://img.shields.io/badge/MongoDB-4ea94b.svg?logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/GitHub%20Pages-327FC7.svg?logo=github&logoColor=white" alt="GitHub Pages" />
    <img src="https://img.shields.io/badge/Vercel-000000.svg?logo=vercel&logoColor=white" alt="Vercel" />
  </p>

  <br/>

  <h3>🎨 Design & Creative Tools</h3>
  <br/>
  <p align="center">
    <img src="https://img.shields.io/badge/Figma-F24E1E.svg?logo=figma&logoColor=white" alt="Figma" />
    <img src="https://img.shields.io/badge/Adobe%20Illustrator-FF9A00.svg?logo=adobe-illustrator&logoColor=white" alt="Adobe Illustrator" />
    <img src="https://img.shields.io/badge/Adobe%20Photoshop-31A8FF.svg?logo=adobe-photoshop&logoColor=white" alt="Adobe Photoshop" />
    <img src="https://img.shields.io/badge/Canva-00C4CC.svg?logo=canva&logoColor=white" alt="Canva" />
  </p>

  <br/>

  <h3>🧰 Developer Tools</h3>
  <br/>
  <p align="center">
    <img src="https://img.shields.io/badge/Git-F05033.svg?logo=git&logoColor=white" alt="Git" />
    <img src="https://img.shields.io/badge/GitHub-181717.svg?logo=github&logoColor=white" alt="GitHub" />
    <img src="https://img.shields.io/badge/Visual%20Studio%20Code-0078d7.svg?logo=visual-studio-code&logoColor=white" alt="VS Code" />
    <img src="https://img.shields.io/badge/Linux-FCC624.svg?logo=linux&logoColor=black" alt="Linux" />
    <img src="https://img.shields.io/badge/Postman-FF6C37.svg?logo=postman&logoColor=white" alt="Postman" />
    <img src="https://img.shields.io/badge/Jupyter-F37626.svg?logo=Jupyter&logoColor=white" alt="Jupyter" />
  </p>

</details>"""

# Find exact boundaries
tech_start = r.find("## Tech Stack")
featured_start = r.find("## Featured Projects")

print("Tech Stack starts at:", tech_start)
print("Featured Projects starts at:", featured_start)
print("Section length:", featured_start - tech_start)

# Replace
new_r = r[:tech_start] + new_tech + r[featured_start:]

with open("README.md", "w", encoding="utf-8") as f:
    f.write(new_r)

print("Replacement done. New length:", len(new_r))