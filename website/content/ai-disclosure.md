---
type: article
title: AI 開示
profile: sorane-okf/0.1
excludeFromList: true
---

記事の frontmatter で、生成 AI の関与を **IPTC / schema.org 準拠**の機械可読フィールドとして宣言できます。人向けには EU 透明性アイコン（任意）も表示されます。

**テキスト記事**の開示は frontmatter で完結します。**`static/` 配下のラスタ画像**は `content/asset-provenance.yaml` と組み合わせて、オプションで IPTC XMP（ExifTool）埋め込みと [C2PA](https://c2pa.org/) 署名ができます（下記）。

## いつ付けるか

**既定は「付けない」。** 人が普通に書いた記事（IME・スペルチェックのみ）では `digitalSourceType` は不要です。

| 状況 | 推奨 |
|---|---|
| 人が書き、AI に推敲・要約・翻訳などを部分的に依頼 | `compositeWithTrainedAlgorithmicMedia` |
| 生成 AI が本文の大部分を書き、人は軽い確認のみ | `trainedAlgorithmicMedia` |
| 「人が書いた」と明示的に機械可読で宣言したい（任意） | `humanEdits`（バッジは出ない） |

## 最小例

```yaml
---
type: article
title: 例の記事
profile: sorane-okf/0.2
digitalSourceType: compositeWithTrainedAlgorithmicMedia
aiDisclosureNote: 下書きに Claude を使用。事実関係は著者が確認済み。
aiSystems:
  - name: Claude
    provider: Anthropic
---
```

`euAiLabel`（`basic` / `fully-generated` / `partially-modified`）は EU アイコンの上書き用です。省略時は `digitalSourceType` から推論されます。

## どこに載るか

開示を付けた記事は、ビルド成果物の次の場所に伝播します。

- 記事 HTML（EU バッジ・任意）
- `BlogPosting` JSON-LD の `digitalSourceType`
- ページ横の `.md` alternate と `okf/bundle.tar.gz`
- `catalog.jsonld` / `search-index.json` / `feed.xml`
- `llms.txt` の開示記事カウント

## 設定（YAML）

```yaml
build:
  ai_disclosure:
    badges: true              # HTML バッジ（既定: 開示あり時 true）
    json_ld: true             # BlogPosting JSON-LD
    machine_readable: true    # catalog / search-index
    atom: true                # feed.xml の category term
    show_on_lists: true       # 一覧のコンパクトアイコン
    policy_url: https://example.com/ai-policy.html
```

`enabled: false` にするとバッジ等を抑えられますが、ページに開示 frontmatter がある場合は JSON-LD 等は既定で有効のままです（設計ドキュメント参照）。

## 検証

```bash
sorane validate --cwd .
```

`sorane-okf/0.2` では未知の `digitalSourceType` や、`euAiLabel` だけで `digitalSourceType` が無い場合はエラーになります。

## 図表の alt

図表フェンス（mermaid / d2 等）には代替テキストを付けてください。`validate` は alt 欠落を **warning** で知らせます（ビルドは継続）。

````markdown
```mermaid alt="認証フロー"
flowchart LR
  A --> B
```
````

またはフェンス内の `%% alt: 認証フロー` コメントでも構いません。詳細は [図表（Mermaid 他）](diagrams.html) を参照してください。

## 静的画像 IPTC XMP

`build.image_metadata.enabled: true` のとき、**ExifTool** が PATH にあれば `asset-provenance.yaml` の内容を XMP に書き込みます（`Digital Source Type` / `AI System Used` / `AI Prompt Information`）。

```yaml
# content/asset-provenance.yaml
assets:
  hero.jpg:
    digitalSourceType: trainedAlgorithmicMedia
    aiDisclosureNote: Prompt and review notes (no secrets / PII)
    aiSystems:
      - name: Example Model
        version: "1"
        provider: Example Inc.
```

```yaml
# sorane.yaml
build:
  image_metadata:
    enabled: true
    exiftool: exiftool   # 省略時は PATH の exiftool
```

- マニフェストにエントリが無い画像はコピーのみ
- `exiftool` 無しのときは **警告のうえコピーのみ**（ビルドは継続）
- Markdown の `![](path)` 参照も解決します。`static/` 参照は `../static/hero.png` のようなパスで `asset-provenance.yaml` にキーを書けます
- `content/` 内のインライン画像（例: `article/assets/fig.png`）はビルド時に `dist/` へコピーされ、同じマニフェストでタグ付けできます

## associatedMedia

記事本文のインライン画像のうち、`asset-provenance.yaml` に `digitalSourceType` があるものは `BlogPosting` JSON-LD の `associatedMedia`（`ImageObject`）として出力されます（`build.ai_disclosure.json_ld: true` 時）。`site.base_url` があると `contentUrl` は絶対 URL になります。

## 静的画像 C2PA

XMP 埋め込みのあと、**c2patool** で manifest を署名できます（オプトイン）。同じ `asset-provenance.yaml` の `digitalSourceType` が C2PA `create` intent にも使われます。

```yaml
# sorane.yaml
build:
  c2pa:
    enabled: true
    embed: true
    certificate_path: /path/to/cert.pem   # または env SORANE_C2PA_CERT
    private_key_path: /path/to/key.pem    # または env SORANE_C2PA_KEY
```

- 証明書はリポジトリにコミットしない（CI Secrets / ローカル dev key）
- 再現可能ビルドが必要な CI では `sorane build --skip-c2pa`
- `c2patool` が PATH に無い、または cred 無しのときは **警告のうえコピーのみ**（ビルドは継続）

## プロファイル

- `sorane-okf/0.1` … 開示フィールドは任意（検証は緩い）
- `sorane-okf/0.2` … 開示フィールドの形状を厳密に検証

スキーマ: [OKF プロファイル](okf-profile.html)（`sorane-okf/0.2`）