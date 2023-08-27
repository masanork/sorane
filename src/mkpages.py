import os
import re
import toml
import markdown
import subprocess
from bs4 import BeautifulSoup
from jinja2 import Environment, FileSystemLoader
import time

def load_config():
    """config.tomlから設定を読み込む"""
    with open("config.toml", "r", encoding="utf-8") as f:
        config = toml.load(f)
    return config

def convert_md_to_html(md_path, template_path='template.html'):
    """MarkdownファイルをHTMLに変換し、テンプレートを適用"""
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
        html_content = markdown.markdown(md_content)
        
        # 作成日と更新日を取得
        creation_date = get_creation_date_from_filename(md_path)
        last_updated_date = get_file_modification_date(md_path)
                
        # Jinja2テンプレートの読み込み
        env = Environment(loader=FileSystemLoader('./templates'))
        template = env.get_template(template_path)
        title = get_title_from_md(md_path)
        rendered_html = template.render(title=title, content=html_content, date_info=date_info)
    return rendered_html

def convert_md_to_html(md_path, template_path='template.html'):
    """MarkdownファイルをHTMLに変換し、テンプレートを適用"""
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
        html_content = markdown.markdown(md_content)

        # 作成日と更新日を取得
        creation_date = get_creation_date_from_filename(os.path.basename(md_path))
        modification_date = get_file_modification_date(md_path)

        # フッターを作成
        footer = '<footer>'
        if creation_date:
            footer += f'作成日: {creation_date} '
        if creation_date != modification_date:
            footer += f'（最終更新: {modification_date}）'
        footer += '</footer>'
        
        # トップページへのリンクとフッターをHTMLに追加
        back_to_top_link = '<a href="index.html">戻る</a>'
        html_content = back_to_top_link + html_content + footer
        
        # Markdownファイルからの見出しを取得してHTMLのタイトルに設定
        page_title = get_title_from_md(md_path)

        # Jinja2テンプレートの読み込み
        env = Environment(loader=FileSystemLoader('./'))
        template = env.get_template(template_path)
        rendered_html = template.render(title=page_title, content=html_content)
    return rendered_html

def get_creation_date_from_filename(filename):
    """ファイル名から作成日を取得する（例：2023-08-26-hoge.md -> 2023-08-26）"""
    pattern = r"(\d{4}-\d{2}-\d{2})"
    match = re.search(pattern, filename)
    if match:
        return match.group(1)
    return None

def generate_index_page(files, config, src_dir, template_path='index_template.html'):
    """index.htmlを生成する（Jinja2を使用）"""
    files_with_dates = [(f, get_creation_date_from_filename(f)) for f in files]
    
    # 日付を取得できなかったファイルを除外し、ユーザーに通知
    invalid_files = [f[0] for f in files_with_dates if f[1] is None]
    for invalid_file in invalid_files:
        print(f"Warning: The filename '{invalid_file}' does not contain a valid date. It will be excluded from the index.")

    # 日付に基づいてファイルをソート
    valid_files = [f[0] for f in files_with_dates if f[1] is not None]
    valid_files.sort(key=lambda x: get_creation_date_from_filename(x), reverse=True)

    links = ""
    for file in valid_files:
        md_path = os.path.join(src_dir, file)
        title = get_title_from_md(md_path)
        creation_date = get_creation_date_from_filename(file)
        html_filename = os.path.splitext(file)[0] + '.html'
        links += f'<p>{creation_date} <a href="{html_filename}">{title}</a></p>'
    
    # Jinja2テンプレートの読み込み
    env = Environment(loader=FileSystemLoader('./'))
    template = env.get_template(template_path)
    rendered_html = template.render(title=config["contents"]["title"], content=links)
    
    return rendered_html

def get_title_from_md(md_path):
    """Markdownファイルからタイトルを取得する"""
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
        html_content = markdown.markdown(md_content)
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # h1〜h6タグを検索して最初の見出しを取得
        for tag_name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            heading = soup.find(tag_name)
            if heading:
                return heading.get_text()
    return None

def get_file_modification_date(filepath):
    """ファイルの更新日を取得する"""
    mod_time = os.path.getmtime(filepath)
    return time.strftime('%Y-%m-%d', time.localtime(mod_time))

def main():
    config = load_config()
    src_dir = config["path"]["posts"]
    out_dir = config["path"]["out"]

    # outディレクトリが存在しない場合、作成する
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)
    
    md_files = []
    for filename in os.listdir(src_dir):
        if filename.endswith('.md'):
            md_files.append(filename)
            # Markdownファイルのパス
            md_path = os.path.join(src_dir, filename)
            
            # 出力するHTMLファイルの名前とパス
            html_filename = os.path.splitext(filename)[0] + '.html'
            html_path = os.path.join(out_dir, html_filename)
            
            # MarkdownをHTMLに変換
            html_content = convert_md_to_html(md_path)
            
            # HTMLファイルとして保存
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            print(f"{md_path} -> {html_path}")
            
            # 生成したHTMLファイルを引数としてmkfontcss.pyを実行
            subprocess.run(["python", "mkfontcss.py", html_path])

    # index.htmlの生成
    index_content = generate_index_page(md_files, config, src_dir)
    index_path = os.path.join(out_dir, 'index.html')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_content)

    # 生成したindex.htmlファイルを引数としてmkfontcss.pyを実行
    subprocess.run(["python", "mkfontcss.py", index_path])

if __name__ == '__main__':
    main()
