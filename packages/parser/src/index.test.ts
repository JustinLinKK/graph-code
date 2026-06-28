import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codeGraphId, scanRepositoryCodeGraph } from "./index";

describe("TypeScript code graph scanner", () => {
  it("extracts directories, files, nested symbols, calls, and control-flow workflows", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-parser-"));
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(rootPath, "src", "math.ts"),
      [
        "export type Result = number;",
        "export interface Options { scale: number }",
        "export function add(left: number, right: number): Result {",
        "  return left + right;",
        "}",
        "export class Calculator {",
        "  multiply(value: number): Result {",
        "    return add(value, value);",
        "  }",
        "}",
        "export function choose(value: number): Result {",
        "  type Local = { label: string };",
        "  function helper(input: number): number {",
        "    return input > 0 ? input : -input;",
        "  }",
        "  if (value < 0) {",
        "    return helper(value);",
        "  } else if (value === 0) {",
        "    throw new Error('zero');",
        "  }",
        "  switch (value) {",
        "    case 1:",
        "      return helper(value);",
        "    default:",
        "      value = helper(value);",
        "  }",
        "  for (let index = 0; index < value; index += 1) {",
        "    if (index > 3) {",
        "      return index;",
        "    }",
        "  }",
        "  try {",
        "    const next = value > 10 ? helper(value) : value;",
        "    return next;",
        "  } catch (error) {",
        "    throw error;",
        "  } finally {",
        "    console.log(value);",
        "  }",
        "}"
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(rootPath, "src", "Widget.tsx"),
      [
        "import { add } from './math';",
        "export const Widget = ({ value }: { value: number }) => {",
        "  return <button>{add(value, 1)}</button>;",
        "};"
      ].join("\n")
    );

    const snapshot = scanRepositoryCodeGraph(rootPath);
    const mathFile = snapshot.files.find((file) => file.path === "src/math.ts");
    const widgetFile = snapshot.files.find((file) => file.path === "src/Widget.tsx");
    const add = snapshot.symbols.find((symbol) => symbol.name === "add");
    const multiply = snapshot.symbols.find((symbol) => symbol.name === "Calculator.multiply");
    const choose = snapshot.symbols.find((symbol) => symbol.name === "choose");
    const helper = snapshot.symbols.find((symbol) => symbol.name === "helper");
    const localType = snapshot.symbols.find((symbol) => symbol.name === "Local");
    const widget = snapshot.symbols.find((symbol) => symbol.name === "Widget");

    expect(snapshot.directories.map((directory) => directory.name)).toEqual(["Code Graph", "src"]);
    expect(mathFile?.id).toBe(codeGraphId("code-file", "src/math.ts"));
    expect(widgetFile?.imports[0]).toEqual({ moduleSpecifier: "./math", resolvedPath: "src/math.ts" });
    expect(add).toEqual(
      expect.objectContaining({
        id: codeGraphId("code-symbol", "src/math.ts:add:3"),
        kind: "function",
        exported: true,
        startLine: 3,
        endLine: 5,
        parentSymbolId: null,
        returnHint: "Result"
      })
    );
    expect(add?.parameters.map((parameter) => parameter.name)).toEqual(["left", "right"]);
    expect(snapshot.symbols.find((symbol) => symbol.name === "Result")?.kind).toBe("object");
    expect(helper?.parentSymbolId).toBe(choose?.id);
    expect(localType?.parentSymbolId).toBe(choose?.id);
    expect(choose?.workflow?.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["entry", "condition", "statement", "return", "throw"])
    );
    expect(choose?.workflow?.nodes.map((node) => node.id)).toContain(`${choose?.id}-process`);
    expect(choose?.workflow?.edges.map((edge) => edge.label)).toEqual(
      expect.arrayContaining(["if value < 0", "else", "case 1", "default", "loop", "exit loop", "catch error", "finally"])
    );
    expect(helper?.workflow?.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(["if input > 0", "else"]));
    expect(multiply?.calls).toContain("add");
    expect(choose?.calls).toContain("helper");
    expect(widget?.symbolKind).toBe("component");
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "imports", sourceId: widgetFile?.id, targetId: mathFile?.id }),
        expect.objectContaining({ kind: "calls", sourceId: multiply?.id, targetId: add?.id }),
        expect.objectContaining({ kind: "calls", sourceId: choose?.id, targetId: helper?.id }),
        expect.objectContaining({ kind: "calls", sourceId: widget?.id, targetId: add?.id })
      ])
    );
  });
});
