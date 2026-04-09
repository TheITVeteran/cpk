/**
 * TypeScript / JavaScript symbol and import extractor.
 *
 * Walks a tree-sitter CST and emits:
 * - Symbols: functions, classes, interfaces, type aliases, exported variables, methods
 * - Imports: file-to-file relationships with imported names
 *
 * Uses direct CST walking (not S-expression queries) for simplicity.
 * Partial results > failure — if a node type is unknown, skip it and continue.
 */
import type ParserType from "web-tree-sitter";
import type { SymbolKind } from "../../shared/types.js";

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
  parent: string | null;
  signature: string | null;
  metadata: Record<string, unknown>;
}

export interface ExtractedImport {
  source: string; // The module path (e.g., "./queries.js", "hono")
  names: string[]; // Imported identifiers
}

export interface ExtractResult {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
}

/**
 * Truncate a string for storage as a signature.
 * Signatures are for human display, not parsing — 200 chars is plenty.
 */
function signature(node: ParserType.SyntaxNode, maxLen = 200): string {
  const text = node.text.replace(/\s+/g, " ").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * Resolve a named field or fall back to a specific child type.
 */
function fieldText(node: ParserType.SyntaxNode, fieldName: string): string | null {
  return node.childForFieldName(fieldName)?.text ?? null;
}

export function extractTypeScript(tree: ParserType.Tree): ExtractResult {
  const symbols: ExtractedSymbol[] = [];
  const imports: ExtractedImport[] = [];

  walk(tree.rootNode, symbols, imports, null, false);

  return { symbols, imports };
}

/**
 * Recursive CST walker.
 * - When we hit an `export_statement`, the contained declaration is marked exported.
 * - When we hit a class body, its methods get the class name as parent.
 */
function walk(
  node: ParserType.SyntaxNode,
  symbols: ExtractedSymbol[],
  imports: ExtractedImport[],
  parentClass: string | null,
  exported: boolean,
): void {
  switch (node.type) {
    case "export_statement": {
      // Check if it's a re-export (e.g., `export { foo } from "./bar"`)
      const source = node.childForFieldName("source");
      if (source) {
        const moduleStr = source.text.slice(1, -1); // strip quotes
        const names: string[] = [];
        // Walk to find export_clause
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child?.type === "export_clause") {
            for (let j = 0; j < child.childCount; j++) {
              const spec = child.child(j);
              if (spec?.type === "export_specifier") {
                const name = fieldText(spec, "name");
                if (name) names.push(name);
              }
            }
          }
        }
        imports.push({ source: moduleStr, names });
        return;
      }

      // Mark inner declaration as exported and recurse
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child, symbols, imports, parentClass, true);
      }
      return;
    }

    case "import_statement": {
      const source = node.childForFieldName("source");
      if (!source) return;
      const moduleStr = source.text.slice(1, -1); // strip quotes

      const names: string[] = [];
      // import_clause contains the imported names
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === "import_clause") {
          collectImportNames(child, names);
        }
      }
      imports.push({ source: moduleStr, names });
      return;
    }

    case "function_declaration": {
      const name = fieldText(node, "name");
      if (name) {
        symbols.push({
          name,
          kind: "function",
          line: node.startPosition.row + 1,
          exported,
          parent: parentClass,
          signature: signature(node),
          metadata: {},
        });
      }
      return;
    }

    case "class_declaration": {
      const name = fieldText(node, "name");
      if (name) {
        symbols.push({
          name,
          kind: "class",
          line: node.startPosition.row + 1,
          exported,
          parent: null,
          signature: signature(node, 120),
          metadata: {},
        });
        // Recurse into class body with name as parent for methods
        const body = node.childForFieldName("body");
        if (body) walk(body, symbols, imports, name, false);
      }
      return;
    }

    case "interface_declaration": {
      const name = fieldText(node, "name");
      if (name) {
        symbols.push({
          name,
          kind: "interface",
          line: node.startPosition.row + 1,
          exported,
          parent: null,
          signature: signature(node, 120),
          metadata: {},
        });
      }
      return;
    }

    case "type_alias_declaration": {
      const name = fieldText(node, "name");
      if (name) {
        symbols.push({
          name,
          kind: "type",
          line: node.startPosition.row + 1,
          exported,
          parent: null,
          signature: signature(node, 160),
          metadata: {},
        });
      }
      return;
    }

    case "method_definition":
    case "method_signature": {
      const name = fieldText(node, "name");
      if (name && parentClass) {
        symbols.push({
          name,
          kind: "method",
          line: node.startPosition.row + 1,
          exported: false,
          parent: parentClass,
          signature: signature(node),
          metadata: {},
        });
      }
      return;
    }

    case "lexical_declaration":
    case "variable_declaration": {
      // const/let/var declarations — only record exported ones to reduce noise
      if (!exported) return;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === "variable_declarator") {
          const name = fieldText(child, "name");
          const value = child.childForFieldName("value");
          if (name) {
            // Arrow function assigned to const: treat as function
            const kind: SymbolKind =
              value?.type === "arrow_function" || value?.type === "function_expression"
                ? "function"
                : "variable";
            symbols.push({
              name,
              kind,
              line: node.startPosition.row + 1,
              exported: true,
              parent: null,
              signature: signature(node),
              metadata: {},
            });
          }
        }
      }
      return;
    }

    default: {
      // Recurse into children for unknown node types
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child, symbols, imports, parentClass, exported);
      }
    }
  }
}

/**
 * Extract imported identifier names from an import_clause.
 * Handles: default import, named imports, namespace import.
 */
function collectImportNames(clause: ParserType.SyntaxNode, out: string[]): void {
  for (let i = 0; i < clause.childCount; i++) {
    const child = clause.child(i);
    if (!child) continue;

    if (child.type === "identifier") {
      // Default import: `import foo from "..."`
      out.push(child.text);
    } else if (child.type === "named_imports") {
      // `import { a, b as c } from "..."`
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j);
        if (spec?.type === "import_specifier") {
          const name = fieldText(spec, "name");
          if (name) out.push(name);
        }
      }
    } else if (child.type === "namespace_import") {
      // `import * as ns from "..."`
      for (let j = 0; j < child.childCount; j++) {
        const sub = child.child(j);
        if (sub?.type === "identifier") {
          out.push(`* as ${sub.text}`);
        }
      }
    }
  }
}
