import os
import markdown
import toml
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
        
        # Markdownファイルからタイトルを取得
        page_title = get_title_from_md(md_path)
        if not page_title:  # タイトルが見つからない場合のデフォルト値
            page_title = "Your Title Here"

        # Jinja2テンプレートの読み込み
        env = Environment(loader=FileSystemLoader('./'))
        template = env.get_template(template_path)
        rendered_html = template.render(title=page_title, content=html_content)
    return rendered_html

def generate_index_page(files, src_dir, template_path='index_template.html'):
    """index.htmlを生成する（Jinja2を使用）"""
    # 作成日でファイルをソート
    files.sort(key=lambda x: get_file_creation_date(os.path.join(src_dir, x)), reverse=True)

    links = ""
    for file in files:
        md_path = os.path.join(src_dir, file)
        title = get_title_from_md(md_path)
        creation_date = get_file_creation_date(md_path)
        last_updated = get_file_modification_date(md_path)

        # 作成日と最終更新日が異なる場合、両方を表示
        if creation_date != last_updated:
            date_str = f'作成日: {creation_date}, 最終更新: {last_updated}'
        else:
            date_str = f'作成日: {creation_date}'

        html_filename = os.path.splitext(file)[0] + '.html'
        links += f'<p><a href="{html_filename}">{title}</a> ({date_str})</p>'
    
    # Jinja2テンプレートの読み込み
    env = Environment(loader=FileSystemLoader('./'))
    template = env.get_template(template_path)
    rendered_html = template.render(title="記事一覧", content=links)
    
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

def get_file_creation_date(filepath):
    """ファイルの作成日を取得する"""
    create_time = os.path.getctime(filepath)
    return time.strftime('%Y-%m-%d', time.localtime(create_time))

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
    index_content = generate_index_page(md_files, src_dir)
    index_path = os.path.join(out_dir, 'index.html')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_content)

    # 生成したindex.htmlファイルを引数としてmkfontcss.pyを実行
    subprocess.run(["python", "mkfontcss.py", index_path])

if __name__ == '__main__':
    main()
