import yaml from "js-yaml";

/** CORE_SCHEMA で YAML を読む（日付の自動 Date 化を防ぐ）。 */
export function parseYaml(source: string): unknown {
  return yaml.load(source, { schema: yaml.CORE_SCHEMA });
}

export function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    schema: yaml.CORE_SCHEMA,
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false,
    noRefs: true,
  });
}