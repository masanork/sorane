import type { PhrasingContent, RootContent } from "mdast";
import type { RubyAnnotationNode } from "../ruby/parse-ruby.ts";
import type { TermLinkNode } from "./parse-term-link.ts";

function phrasingToSource(nodes: readonly PhrasingContent[]): string {
  return nodes.map((n) => phrasingNodeToSource(n)).join("");
}

function phrasingNodeToSource(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "emphasis":
      return `*${phrasingToSource(node.children)}*`;
    case "strong":
      return `**${phrasingToSource(node.children)}**`;
    case "delete":
      return `~~${phrasingToSource(node.children)}~~`;
    case "inlineCode":
      return `\`${node.value}\``;
    case "break":
      return "\n";
    case "link": {
      const title =
        typeof node.title === "string" && node.title.length > 0
          ? ` "${node.title.replace(/"/g, '\\"')}"`
          : "";
      return `[${phrasingToSource(node.children)}](${node.url}${title})`;
    }
    case "image": {
      const alt = typeof node.alt === "string" ? node.alt : "";
      const title =
        typeof node.title === "string" && node.title.length > 0
          ? ` "${node.title.replace(/"/g, '\\"')}"`
          : "";
      return `![${alt}](${node.url}${title})`;
    }
    case "html":
      return node.value;
    case "ruby": {
      const r = node as unknown as RubyAnnotationNode;
      if (r.source === "markdown") return `{${r.base}|${r.text}}`;
      return `${r.base}《${r.text}》`;
    }
    case "termLink": {
      const t = node as unknown as TermLinkNode;
      if (typeof t.label === "string" && t.label.length > 0) {
        return `[[term:${t.termId}|${t.label}]]`;
      }
      return `[[term:${t.termId}]]`;
    }
    default:
      return "";
  }
}

function blockToSource(node: RootContent): string {
  switch (node.type) {
    case "paragraph":
      return phrasingToSource(node.children);
    case "heading":
      return `${"#".repeat(node.depth)} ${phrasingToSource(node.children)}`;
    case "list": {
      const ordered = node.ordered === true;
      const start = typeof node.start === "number" ? node.start : 1;
      return node.children
        .map((item, i) => {
          const marker = ordered ? `${start + i}. ` : "- ";
          const body = item.children.map((c) => blockToSource(c)).join("\n");
          return marker + body.replace(/\n/g, "\n  ");
        })
        .join("\n");
    }
    case "blockquote":
      return node.children
        .map((c) => blockToSource(c))
        .map((line) => line.split("\n").map((l) => `> ${l}`).join("\n"))
        .join("\n");
    case "code": {
      const lang = typeof node.lang === "string" && node.lang.length > 0 ? node.lang : "";
      const fence = "```";
      return `${fence}${lang}\n${node.value}\n${fence}`;
    }
    case "thematicBreak":
      return "---";
    case "html":
      return node.value;
    default:
      return "";
  }
}

/** mdast 部分木を Markdown ソースへ戻す（ruby / termLink を保持）。 */
export function mdastNodesToMarkdown(nodes: readonly RootContent[]): string {
  return nodes
    .map((n) => blockToSource(n))
    .filter((s) => s.length > 0)
    .join("\n\n")
    .trim();
}