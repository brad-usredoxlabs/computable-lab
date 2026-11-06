/**
 * domainSetDeclaration.test.ts — tests that the vocabulary's domain declaration slot
 * accepts a set (string array) and that the loader preserves both tags.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadScientistIntentVocabulary } from "./vocabulary.js";

const PROJECT_ROOT = resolve(process.cwd(), "..");
const SCHEMA_SRC = resolve(PROJECT_ROOT, "schema", "scientist-intent", "scientist-intent-vocabulary.schema.yaml");
const LINT_SRC = resolve(PROJECT_ROOT, "schema", "scientist-intent", "scientist-intent-vocabulary.lint.yaml");

function prepareTest(dirName: string, dataYaml: string): string {
  const dir = join("/tmp", `vocab-domain-set-${dirName}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dataPath = join(dir, "scientist-intent-vocabulary.yaml");
  writeFileSync(dataPath, dataYaml);
  writeFileSync(
    join(dir, "scientist-intent-vocabulary.schema.yaml"),
    readFileSync(SCHEMA_SRC, "utf-8"),
  );
  writeFileSync(
    join(dir, "scientist-intent-vocabulary.lint.yaml"),
    readFileSync(LINT_SRC, "utf-8"),
  );
  return dataPath;
}

describe("domain set declaration", () => {
  afterAll(() => {
    for (const name of ["set-valid", "empty-array", "empty-string-member"]) {
      const dir = join("/tmp", `vocab-domain-set-${name}`);
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });

  it("accepts domain as a set of two landing zones and exposes both tags", () => {
    const dataPath = prepareTest("set-valid", `
version: 1
verbs:
  - name: test_transfer
    class: simple
    policyRef: hint-authority
    args:
      - name: source
        kind: resolvable
        required: false
        domain: [labware, material]
      - name: target
        kind: resolvable
        required: false
        domain: labware
policies:
  strategyOrder: [label_match, declared_substance]
  ambiguity:
    mode: fail
    confidenceAccept: { min: 0.9, max: 1.0 }
    strategyRef: label_match
  hintAuthority:
    mode: hint-only
    strategyRef: label_match
  ruleIds: [hint-authority]
`);
    const vocab = loadScientistIntentVocabulary({ path: dataPath });
    const contracts = vocab.argContracts("test_transfer");
    expect(contracts).toHaveLength(2);

    const sourceContract = contracts.find((c) => c.name === "source")!;
    expect(Array.isArray(sourceContract.domain)).toBe(true);
    expect(sourceContract.domain).toEqual(["labware", "material"]);

    const targetContract = contracts.find((c) => c.name === "target")!;
    expect(targetContract.domain).toBe("labware");
  });

  it("rejects an empty domain array (domain: [])", () => {
    const dataPath = prepareTest("empty-array", `
version: 1
verbs:
  - name: test_bad
    class: simple
    policyRef: hint-authority
    args:
      - name: source
        kind: resolvable
        required: false
        domain: []
policies:
  strategyOrder: [label_match]
  ambiguity:
    mode: fail
    confidenceAccept: { min: 0.9, max: 1.0 }
    strategyRef: label_match
  hintAuthority:
    mode: hint-only
    strategyRef: label_match
  ruleIds: [hint-authority]
`);
    expect(() => loadScientistIntentVocabulary({ path: dataPath })).toThrow();
  });

  it("rejects a domain array with an empty string member (domain: [labware, ''])", () => {
    const dataPath = prepareTest("empty-string-member", `
version: 1
verbs:
  - name: test_bad2
    class: simple
    policyRef: hint-authority
    args:
      - name: source
        kind: resolvable
        required: false
        domain: [labware, ""]
policies:
  strategyOrder: [label_match]
  ambiguity:
    mode: fail
    confidenceAccept: { min: 0.9, max: 1.0 }
    strategyRef: label_match
  hintAuthority:
    mode: hint-only
    strategyRef: label_match
  ruleIds: [hint-authority]
`);
    expect(() => loadScientistIntentVocabulary({ path: dataPath })).toThrow();
  });
});
