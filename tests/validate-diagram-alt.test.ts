import { describe, expect, test } from "./_expect.ts";
import { validateDiagramAltWarnings } from "../packages/core/src/diagrams/validate-diagram-alt.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

describe("validateDiagramAltWarnings", () => {
  test("mermaid に alt が無いと warning", () => {
    const body = "```mermaid\nflowchart LR\n  A --> B\n```\n";
    const warnings = validateDiagramAltWarnings(body, DEFAULT_DIAGRAMS_CONFIG);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("mermaid");
  });

  test("alt=\"...\" があれば warning なし", () => {
    const body = '```mermaid alt="Flow"\nflowchart LR\n  A --> B\n```\n';
    expect(validateDiagramAltWarnings(body, DEFAULT_DIAGRAMS_CONFIG)).toEqual([]);
  });

  test("%% alt: コメントでも OK", () => {
    const body = "```mermaid\n%% alt: Flow chart\nflowchart LR\n  A --> B\n```\n";
    expect(validateDiagramAltWarnings(body, DEFAULT_DIAGRAMS_CONFIG)).toEqual([]);
  });

  test("mermaid.mode: off では検査しない", () => {
    const body = "```mermaid\nflowchart LR\n```\n";
    const warnings = validateDiagramAltWarnings(body, {
      ...DEFAULT_DIAGRAMS_CONFIG,
      mermaid: { ...DEFAULT_DIAGRAMS_CONFIG.mermaid, mode: "off" },
    });
    expect(warnings).toEqual([]);
  });

  test("d2 は enabled 時のみ検査", () => {
    const body = "```d2\nx -> y\n```\n";
    expect(validateDiagramAltWarnings(body, DEFAULT_DIAGRAMS_CONFIG)).toEqual([]);
    const enabled = {
      ...DEFAULT_DIAGRAMS_CONFIG,
      d2: { ...DEFAULT_DIAGRAMS_CONFIG.d2, enabled: true },
    };
    expect(validateDiagramAltWarnings(body, enabled).length).toBe(1);
  });
});