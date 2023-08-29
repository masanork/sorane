import base64
import os
import re
import sys
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

        # Extracting IVS if format is 14 (Unicode Variation Sequences)
        if table.format == 14:
            for uvs in table.uvsDict.values():
                for uv in uvs:
                    base, selector = uv[0], uv[1]
                    ivs_sequences.add((base, selector))

    os.remove('temp_font.woff2')
    return sorted(codepoints), sorted(ivs_sequences, key=lambda x: x[0])

def main(css_file):
    font_data_list = extract_data_uris_and_metadata_from_css(css_file)

    for idx, (font_name, data_uri) in enumerate(font_data_list, 1):
        woff2_data = decode_woff2_from_data_uri(data_uri)
        codepoints, variants = get_codepoints_and_variants_from_font_binary(woff2_data)

        print(f"Data URI #{idx} - Font Name: {font_name}:")
        for cp in codepoints:
            char_repr = chr(cp) if cp <= 0x10FFFF else '?'
            print(f"{hex(cp)} ({char_repr})")

            related_ivs = [(base, selector) for base, selector in variants if base == cp]
            for _, glyph_name in related_ivs:
                print(f"  IVS Variant: {hex(cp)} ({glyph_name if glyph_name else 'default'})")

        print("\n" + "-"*40 + "\n")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python script_name.py [CSS_FILE_NAME]")
        sys.exit(1)

    main(sys.argv[1])
