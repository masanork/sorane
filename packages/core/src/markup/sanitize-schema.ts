import type { Schema } from "hast-util-sanitize";
import { defaultSchema } from "rehype-sanitize";

const schemaAttributes = defaultSchema.attributes ?? {};

/** はてな移行記事の HTML を許可しつつ script 等は落とす。 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
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
    span: [
      ...(schemaAttributes.span ?? []),
      ["style", /^font-style:\s*italic;?$/i],
      ["className", "glossary-term-unresolved"],
      "dataSoraneTerm",
    ],
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
      ],
      "role",
    ],
    figcaption: [],
    iframe: ["src", "width", "height", "frameBorder", "allowFullScreen"],
    embed: ["src", "type", "width", "height"],
    object: ["width", "height"],
    param: ["name", "value"],
    img: [...(schemaAttributes.img ?? []), "title", "loading", "decoding"],
    pre: [...(schemaAttributes.pre ?? []), "dataSoraneAlt"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "center",
    "embed",
    "figcaption",
    "figure",
    "iframe",
    "object",
    "param",
    "ruby",
    "rt",
  ],
};

export interface TocEntry {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
}