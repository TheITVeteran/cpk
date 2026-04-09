import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_EXTENSIONS, grammarForExtension, initParser, parseSource } from "./parser.js";

describe("tree-sitter parser", () => {
  beforeAll(async () => {
    await initParser();
  });

  it("maps extensions to grammar names", () => {
    expect(grammarForExtension(".ts")).toBe("typescript");
    expect(grammarForExtension(".tsx")).toBe("tsx");
    expect(grammarForExtension(".js")).toBe("javascript");
    expect(grammarForExtension(".py")).toBe("python");
    expect(grammarForExtension(".go")).toBe("go");
    expect(grammarForExtension(".rs")).toBeUndefined();
  });

  it("has supported extensions set", () => {
    expect(SUPPORTED_EXTENSIONS.has(".ts")).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has(".rs")).toBe(false);
  });

  it("parses TypeScript and returns a tree", async () => {
    const source = `
export function greet(name: string): string {
  return \`Hello, \${name}\`;
}

const x = 42;
`;
    const tree = await parseSource(source, ".ts");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("program");
    expect(tree!.rootNode.childCount).toBeGreaterThan(0);
  });

  it("parses JavaScript", async () => {
    const source = `function add(a, b) { return a + b; }`;
    const tree = await parseSource(source, ".js");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("program");
  });

  it("parses Python", async () => {
    const source = `
def greet(name):
    return f"Hello, {name}"

class User:
    def __init__(self, name):
        self.name = name
`;
    const tree = await parseSource(source, ".py");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("module");
  });

  it("parses Go", async () => {
    const source = `
package main

func Add(a, b int) int {
    return a + b
}
`;
    const tree = await parseSource(source, ".go");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("source_file");
  });

  it("extracts function node from TypeScript tree", async () => {
    const source = `export function pickupTask(id: string): Task { return db.get(id); }`;
    const tree = await parseSource(source, ".ts");
    expect(tree).not.toBeNull();

    // Walk to find the function declaration
    const root = tree!.rootNode;
    let foundFunction = false;
    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i);
      if (child?.type === "export_statement") {
        const decl = child.child(1);
        if (decl?.type === "function_declaration") {
          const nameNode = decl.childForFieldName("name");
          expect(nameNode?.text).toBe("pickupTask");
          foundFunction = true;
        }
      }
    }
    expect(foundFunction).toBe(true);
  });

  it("returns null for unsupported extensions", async () => {
    const tree = await parseSource("fn main() {}", ".rs");
    expect(tree).toBeNull();
  });
});
