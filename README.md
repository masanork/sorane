sorane - Static Site Generator
===

sorane is a static site generator written in Python.

- mkfontindex.py - Font Indexer
- mkfontcss.py - WebFont embedded CSS generator
- mkpages.py - HTML pages generator

Usage
---

At first, you should make fontindex for default font and bold font.

```bash
python mkfontindex.py TrueTypeFontFile.ttf --style=default
python mkfontindex.py TrueTypeBoldFontFile.ttf --style=H1
python mkfontindex.py TrueTypeBoldFontFile.ttf --style=H2
```

Please place Markdown files in the "posts" directory with the format "YYYY-MM-DD-Title.md" for the file name. A file with the same name as the file in the "posts" directory will be created in the output directory, and HTML and CSS will be generated.

```bash
python mkpages.py
```
