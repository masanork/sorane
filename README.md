sorane - Static Site Generator
===

sorane is a static site generator written in Python.

mkfontindex.py - Font Indexer
mkfontcss.py - WebFont embedded CSS
mkpages.py - HTML pages generator

Usage
---

最初に、フォントファイルをインデックスします。少なくともdefaultを、できればH1とH2向けもインデックスしてください。

```bash
python mkfontindex.py TrueTypeFontFile.ttf --style=default
python mkfontindex.py TrueTypeBoldFontFile.ttf --style=H1
python mkfontindex.py TrueTypeBoldFontFile.ttf --style=H2
```

postsディレクトリにMarkdownファイルを配置してください。ファイル名は、YYYY-MM-DD-Title.mdの形式にしてください。出力ディレクトリには、postsディレクトリのファイル名と同じ名前のファイルが作成され、HTMLとCSSが生成されます。

```bash
python mkpages.py
```
