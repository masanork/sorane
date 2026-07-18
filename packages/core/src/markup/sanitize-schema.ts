import type { Schema } from "hast-util-sanitize";
import { defaultSchema } from "rehype-sanitize";

const schemaAttributes = defaultSchema.attributes ?? {};

const BASE_ATTRIBUTES = {
  ...schemaAttributes,
  a: [
    ...(schemaAttributes.a ?? []).filter(
      (entry) => (typeof entry === "string" ? entry : entry[0]) !== "className",
    ),
    "title",
    ["className", "data-footnote-backref", "keyword", "okeyword", "heading-anchor", "glossary-term-link"],
    "dataSoraneTerm",
  ],
  h1: [...(schemaAttributes.h1 ?? []), "id"],
  h2: [...(schemaAttributes.h2 ?? []), "id"],
  h3: [...(schemaAttributes.h3 ?? []), "id"],
  h4: [...(schemaAttributes.h4 ?? []), "id"],
  h5: [...(schemaAttributes.h5 ?? []), "id"],
  h6: [...(schemaAttributes.h6 ?? []), "id"],
  blockquote: [
    ...(schemaAttributes.blockquote ?? []),
    ["className", "twitter-tweet"],
    "dataLang",
    "dataDnt",
    "dataConversation",
  ],
  span: [...(schemaAttributes.span ?? []), "dataSoraneTerm", ["className", "glossary-term-unresolved"]],
  ruby: [],
  rt: [],
  figure: [
    [
      "className",
      "figure-image",
      "figure-image-fotolife",
      "mceNonEditable",
      "diagram",
      "diagram--d2",
      "diagram--mermaid",
      "diagram--graphviz",
      "diagram--plantuml",
    ],
    "role",
  ],
  figcaption: [],
  img: [...(schemaAttributes.img ?? []), "title", "loading", "decoding"],
  pre: [...(schemaAttributes.pre ?? []), "dataSoraneAlt"],
} as Schema["attributes"];

const BASE_TAG_NAMES = [
  ...(defaultSchema.tagNames ?? []),
  "center",
  "figcaption",
  "figure",
  "ruby",
  "rt",
] as string[];

const EMBED_TAG_NAMES = ["iframe", "embed", "object", "param"] as const;

const EMBED_ATTRIBUTES = {
  iframe: ["src", "width", "height", "frameBorder", "allowFullScreen"],
  embed: ["src", "type", "width", "height"],
  object: ["width", "height"],
  param: ["name", "value"],
} as const;

export interface SanitizeSchemaOptions {
  /** false のとき iframe/embed/object を許可（src は rehype で https のみ） */
  readonly strictHtml?: boolean;
}

/** はてな移行記事の HTML を許可しつつ script 等は落とす。 */
export function buildSanitizeSchema(opts: SanitizeSchemaOptions = {}): Schema {
  const strict = opts.strictHtml === true;
  const tagNames = strict
    ? BASE_TAG_NAMES
    : [...BASE_TAG_NAMES, ...EMBED_TAG_NAMES];
  const attributes: Schema["attributes"] = strict
    ? BASE_ATTRIBUTES
    : {
        ...BASE_ATTRIBUTES,
        iframe: [...EMBED_ATTRIBUTES.iframe],
        embed: [...EMBED_ATTRIBUTES.embed],
        object: [...EMBED_ATTRIBUTES.object],
        param: [...EMBED_ATTRIBUTES.param],
      };
  return {
    ...defaultSchema,
    clobberPrefix: "",
    attributes,
    tagNames,
  };
}

/** 既定: embed なし（https フィルタは rehype で別途）。 */
export const sanitizeSchema: Schema = buildSanitizeSchema({ strictHtml: true });

export interface TocEntry {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
}