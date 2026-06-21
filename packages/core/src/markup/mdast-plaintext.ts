import type { PhrasingContent, RootContent } from "mdast";
import type { RubyAnnotationNode } from "../ruby/parse-ruby.ts";
import type { TermLinkNode } from "./parse-term-link.ts";

/** inline / block ノードをプレーンテキスト化する（見出しラベル・JSON-LD 用）。 */
export function mdastNodeToPlainText(node: PhrasingContent | RootContent): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "inlineCode":
      return node.value;
    case "break":
      return "\n";
    case "emphasis":
    case "strong":
    case "delete":
      return node.children.map((c) => mdastNodeToPlainText(c)).join("");
    case "link": {
      const label = node.children.map((c) => mdastNodeToPlainText(c)).join("");
      return label.length > 0 ? label : node.url;
    }
    case "image":
      return typeof node.alt === "string" ? node.alt : "";
    case "html":
      return "";
    case "ruby": {
      const r = node as unknown as RubyAnnotationNode;
      return r.base + r.text;
    }
    case "termLink": {
      const t = node as unknown as TermLinkNode;
      return typeof t.label === "string" && t.label.length > 0 ? t.label : t.termId;
    }
    case "paragraph":
    case "heading":
      return node.children.map((c) => mdastNodeToPlainText(c)).join("");
    case "list":
      return node.children.map((item) => mdastNodeToPlainText(item)).join("\n");
    case "listItem":
      return node.children.map((c) => mdastNodeToPlainText(c)).join("\n");
    case "blockquote":
      return node.children.map((c) => mdastNodeToPlainText(c)).join("\n");
    case "code":
      return node.value;
    case "table":
      return node.children
        .map((row) =>
          row.children
            .map((cell) => cell.children.map((c) => mdastNodeToPlainText(c)).join(""))
            .join(" "),
        )
        .join("\n");
    case "thematicBreak":
      return "";
    default: {
      const children = (node as { children?: readonly (PhrasingContent | RootContent)[] }).children;
      if (Array.isArray(children)) {
        return children.map((c) => mdastNodeToPlainText(c)).join("");
      }
      const value = (node as { value?: string }).value;
      return typeof value === "string" ? value : "";
    }
  }
}

export function mdastNodesToPlainText(nodes: readonly RootContent[]): string {
  return nodes
    .map((n) => mdastNodeToPlainText(n))
    .filter((s) => s.length > 0)
    .join("\n")
    .trim();
}