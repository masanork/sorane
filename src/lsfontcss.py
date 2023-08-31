import base64
import os
import re
import sys
import argparse
from fontTools.ttLib import TTFont

def extract_data_uris_and_metadata_from_css(css_file):
    """Extracts all data URIs and associated metadata from a CSS file."""
    with open(css_file, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(r"font-family: '([^']+)'[^}]*src: url\((data:font/woff2;base64,[^)]+)\)")
    return pattern.findall(content)

def decode_woff2_from_data_uri(data_uri):
    """Decodes a WOFF2 font from a Data URI."""
    match = re.match(r'data:[^;]+;base64,(.*)', data_uri)
    base64_data = match.group(1)
    return base64.b64decode(base64_data)

def get_codepoints_and_variants_from_font_binary(font_binary):
    """Extracts all used codepoints and their IVS from a font binary."""
    with open('temp_font.woff2', 'wb') as f:
        f.write(font_binary)

    font = TTFont('temp_font.woff2')
    codepoints = set()
    ivs_sequences = set()

    for table in font['cmap'].tables:
        codepoints.update(table.cmap.keys())

        if table.format == 14:
            for uvs in table.uvsDict.values():
                for uv in uvs:
                    base, selector = uv[0], uv[1]
                    if isinstance(selector, str):  # Convert glyph name to corresponding codepoint
                        selector_codepoint = font.getGlyphID(selector)
                        ivs_sequences.add((base, selector_codepoint))
                    elif selector is not None:  # Exclude None values
                        ivs_sequences.add((base, selector))

    os.remove('temp_font.woff2')
    return sorted(codepoints), sorted(ivs_sequences, key=lambda x: x[0])

def display_font_tables(font_binary, dump_content=False):
    """Displays all tables and their contents present in a font binary."""
    with open('temp_font.woff2', 'wb') as f:
        f.write(font_binary)

    font = TTFont('temp_font.woff2')
    print("Available tables in the font:")
    for table_name in font.keys():
        print(f"\nTable: {table_name}\n{'-'*40}")
        if dump_content:
            try:
                table_data = font.getTableData(table_name)
                print(table_data)
            except:
                print(f"Unable to display content for table: {table_name}")

    os.remove('temp_font.woff2')

def get_correct_ivs(selector):
    return 0xE0100 + selector

def main(args):
    font_data_list = extract_data_uris_and_metadata_from_css(args.css_file)
    
    for idx, (font_name, data_uri) in enumerate(font_data_list, 1):
        woff2_data = decode_woff2_from_data_uri(data_uri)
        codepoints, variants = get_codepoints_and_variants_from_font_binary(woff2_data)

        print(f"Data URI #{idx} - Font Name: {font_name}:")
        for cp in codepoints:
            char_repr = chr(cp) if cp <= 0x10FFFF else '?'
            print(f"{hex(cp)} ({char_repr})")

            related_ivs = [(base, selector) for base, selector in variants if base == cp]

            for base, selector in related_ivs:
                if selector is None:
                    print(f"  IVS Default Variant for {hex(base)}")
                    continue

                if isinstance(selector, str):  # selectorが文字列の場合のデバッグ出力
                    print(f"Unexpected string selector: {selector} for base {hex(base)}")
                    continue

                ivs_repr = chr(base) + chr(get_correct_ivs(selector))  # IVSを適用した文字列
                print(f"  IVS Variant: {hex(base)}+{hex(selector)} ({ivs_repr})")

        print("\n" + "-"*40 + "\n")

        # テーブルを表示
        display_font_tables(woff2_data, args.dump)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract glyphs and font tables from a CSS file.')
    parser.add_argument('css_file', help='The CSS file to process.')
    parser.add_argument('--dump', action='store_true', help='Dump the content of the font tables.')
    
    args = parser.parse_args()
    main(args)
