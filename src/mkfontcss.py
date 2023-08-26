import os
import re
import csv
import argparse
import base64
from bs4 import BeautifulSoup
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter

def load_font_index(style=None, tag_name=None, fonts_dir="fonts"):
    # 初めにstyleを試す
    if style and os.path.exists(os.path.join(fonts_dir, style + ".csv")):
        csv_name = style + ".csv"
    # 次にtag_nameを試す
    elif tag_name and os.path.exists(os.path.join(fonts_dir, tag_name + ".csv")):
        csv_name = tag_name + ".csv"
    # それ以外の場合、defaultを使う
    else:
        csv_name = "default.csv"

    csv_path = os.path.join(fonts_dir, csv_name)    
    font_index = {}
    with open(csv_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)  # Skip header
        for row in reader:
            character, font_file = row
            font_index[character] = font_file
    return font_index

def generate_data_uri(font_path, characters):
    font = TTFont(font_path)
    
    # Get font's family name
    font_family_name = font["name"].getName(1, 3, 1, 1033).toUnicode()
    
    # Subset font to only include specified characters
    subsetter = Subsetter()
    subsetter.populate(text=characters)
    subsetter.subset(font)

    # Convert font to WOFF2 format
    from io import BytesIO
    font_stream = BytesIO()
    font.flavor = "woff2"
    font.save(font_stream)
    font_data = font_stream.getvalue()

    return font_family_name, f"data:font/woff2;base64,{base64.b64encode(font_data).decode('utf-8')}"

def get_tags_content(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    tags_content = {}
    for tag in soup.find_all(True):
        if tag.name not in tags_content:
            tags_content[tag.name] = tag.get_text()
        else:
            tags_content[tag.name] += tag.get_text()
    return tags_content

def inject_css_into_html(html_file, css_file):
    with open(css_file, 'r', encoding='utf-8') as f:
        css_content = f.read()

    # font-familyの値を正規表現で取得
    font_family_names = [m.group(1) for line in css_content.splitlines() if "font-family" in line and (m := re.search(r"font-family: '([^']+)';", line))]

    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # CSSファイルの名前だけを取得
    css_filename_only = os.path.basename(css_file)

    # CSSファイルへのリンクを挿入
    css_link = f'<link rel="stylesheet" type="text/css" href="{css_filename_only}">'

    # すべてのフォントを参照するスタイルを追加
    style_content = f"<style>body {{ font-family: {', '.join(font_family_names)}; }}</style>"

    if '</head>' in content:
        content = content.replace('</head>', f'{css_link}{style_content}</head>', 1)
    else:
        content = css_link + style_content + content

    output_html_file = html_file
    
    with open(output_html_file, 'w', encoding='utf-8') as f:
        f.write(content)

    return output_html_file

def get_font_family_name(font_file_path):
    font = TTFont(font_file_path)
    return font["name"].getName(1, 3, 1, 1033).toUnicode()


def main():
    processed_fonts = set()
    parser = argparse.ArgumentParser(description='Generate CSS with embedded font data for specified HTML file and update the HTML file to use the font.')
    parser.add_argument('file', help='The HTML file to process.')
    parser.add_argument('--style', help='Style name for selecting the appropriate CSV font index.')
    args = parser.parse_args()

    with open(args.file, 'r', encoding='utf-8') as f:
        html_content = f.read()

    tags_content = get_tags_content(html_content)
    css_content = ""

    # すべてのタグのために使用されるフォントを集める
    all_used_fonts = set()

    for tag_name, content in tags_content.items():
        font_index = load_font_index(style=tag_name)
        used_fonts_for_tag = {font_index[char] for char in content if char in font_index}
        all_used_fonts.update(used_fonts_for_tag)

        for font_file in used_fonts_for_tag:
            relevant_chars = "".join([char for char in content if font_index.get(char) == font_file])
            font_family_name, data_uri = generate_data_uri(os.path.join("fonts", font_file), relevant_chars)

            if font_family_name not in processed_fonts:
                css_content += f"""
                @font-face {{
                    font-family: '{font_family_name}';
                    src: url({data_uri}) format('woff2');
                }}"""
                processed_fonts.add(font_family_name)
        
        # ここで、特定のタグに対してフォントを適用します。
        font_family_names_for_tag = [get_font_family_name(os.path.join("fonts", font_file)) for font_file in used_fonts_for_tag]
        css_content += f"\n{tag_name} {{ font-family: {', '.join(font_family_names_for_tag)}; }}"

    output_css_file = os.path.splitext(args.file)[0] + ".css"
    with open(output_css_file, 'w', encoding='utf-8') as f:
        f.write(css_content)

    # Update HTML to reference the generated CSS
    inject_css_into_html(args.file, output_css_file)

    print(f"CSS file saved to {output_css_file} and HTML file updated to reference the CSS.")

if __name__ == "__main__":
    main()
