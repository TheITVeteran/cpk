/**
 * Tree-sitter WASM parser.
 *
 * Loads grammar WASM files from grammars/ at package root.
 * Caches Parser instance and Language objects for reuse across files.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// web-tree-sitter types
import type ParserType from "web-tree-sitter";

let Parser: typeof ParserType;
let parserInstance: ParserType | null = null;
let initialized = false;
const languageCache = new Map<string, ParserType.Language>();

const EXTENSION_TO_GRAMMAR: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
};

/**
 * Walk up from current file to find the package root (where package.json lives).
 * Same pattern as generate.ts template resolution.
 */
function findPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  let dir = dirname(__filename);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("Cannot find package root for grammar resolution");
}

/**
 * Initialize the tree-sitter WASM runtime.
 * Must be called before any parsing. Safe to call multiple times.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;

  // Dynamic import to avoid bundling issues
  const mod = await import("web-tree-sitter");
  Parser = mod.default;

  const pkgRoot = findPackageRoot();

  // web-tree-sitter needs its own tree-sitter.wasm runtime file
  const runtimeWasm = join(pkgRoot, "node_modules", "web-tree-sitter", "tree-sitter.wasm");

  // Try package's node_modules first, then check if runtime wasm is bundled with the module
  if (existsSync(runtimeWasm)) {
    await Parser.init({
      locateFile: () => runtimeWasm,
    });
  } else {
    // Fallback: let web-tree-sitter resolve it internally
    await Parser.init();
  }

  parserInstance = new Parser();
  initialized = true;
}

/**
 * Load a language grammar by name. Cached after first load.
 */
export async function loadLanguage(grammarName: string): Promise<ParserType.Language> {
  const cached = languageCache.get(grammarName);
  if (cached) return cached;

  const pkgRoot = findPackageRoot();
  const wasmPath = join(pkgRoot, "grammars", `tree-sitter-${grammarName}.wasm`);

  if (!existsSync(wasmPath)) {
    throw new Error(
      `Grammar not found: tree-sitter-${grammarName}.wasm (looked in ${join(pkgRoot, "grammars")})`,
    );
  }

  // Load WASM bytes and pass to Language.load
  const wasmBytes = readFileSync(wasmPath);
  const language = await Parser.Language.load(wasmBytes);
  languageCache.set(grammarName, language);
  return language;
}

/**
 * Get the grammar name for a file extension.
 * Returns undefined for unsupported extensions.
 */
export function grammarForExtension(ext: string): string | undefined {
  return EXTENSION_TO_GRAMMAR[ext];
}

/**
 * Parse a source string with the appropriate grammar for the given file extension.
 * Returns the CST (concrete syntax tree) or null if the extension is unsupported.
 */
export async function parseSource(
  source: string,
  extension: string,
): Promise<ParserType.Tree | null> {
  if (!initialized || !parserInstance) {
    throw new Error("Parser not initialized. Call initParser() first.");
  }

  const grammarName = grammarForExtension(extension);
  if (!grammarName) return null;

  const language = await loadLanguage(grammarName);
  parserInstance.setLanguage(language);
  return parserInstance.parse(source);
}

/**
 * Supported file extensions.
 */
export const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_GRAMMAR));
