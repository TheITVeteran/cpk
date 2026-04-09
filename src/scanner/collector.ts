/**
 * File discovery for the code scanner.
 *
 * Walks the project tree, respects .gitignore and .codepaktignore,
 * returns paths (relative to project root) for supported source files.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SUPPORTED_EXTENSIONS } from "./parser.js";

/** Directories we always skip regardless of .gitignore. */
const ALWAYS_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
  "vendor",
  ".codepakt",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "coverage",
  ".cache",
]);

/**
 * Parse a .gitignore-style file into a list of patterns.
 * Minimal support: literal paths, * wildcards, directory suffix, negation prefix.
 */
function parseIgnoreFile(path: string): string[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Check if a relative path matches any ignore pattern.
 * This is a minimal glob-to-regex implementation, not full gitignore spec.
 */
function matchesIgnore(relPath: string, patterns: string[]): boolean {
  // Normalize to forward slashes for matching
  const normalized = relPath.split(sep).join("/");

  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue; // negation not supported in MVP

    // Strip leading slash (gitignore uses it for root-relative)
    const pat = pattern.startsWith("/") ? pattern.slice(1) : pattern;

    // Directory match: pattern ending in / matches any path inside
    if (pat.endsWith("/")) {
      const dir = pat.slice(0, -1);
      if (normalized === dir || normalized.startsWith(`${dir}/`)) return true;
      continue;
    }

    // Literal match or suffix match
    if (normalized === pat || normalized.endsWith(`/${pat}`)) return true;

    // Glob with *: convert to regex
    if (pat.includes("*")) {
      const regex = new RegExp(
        `^${pat
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*")}$`,
      );
      if (regex.test(normalized)) return true;
      // Also match in any subdirectory
      const pathSegments = normalized.split("/");
      for (let i = 0; i < pathSegments.length; i++) {
        const suffix = pathSegments.slice(i).join("/");
        if (regex.test(suffix)) return true;
      }
    }
  }
  return false;
}

/**
 * Extract the file extension, including the dot. Returns empty string if none.
 */
function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return "";
  return filename.slice(idx).toLowerCase();
}

/**
 * Collect all source files under projectPath that match supported extensions.
 * Returns paths relative to projectPath, using platform-native separators.
 */
export function collectFiles(projectPath: string): string[] {
  const gitignorePatterns = parseIgnoreFile(join(projectPath, ".gitignore"));
  const codepaktignorePatterns = parseIgnoreFile(join(projectPath, ".codepaktignore"));
  const allPatterns = [...gitignorePatterns, ...codepaktignorePatterns];

  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // Permission error, skip
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relPath = relative(projectPath, fullPath);

      // Always-skip directories
      if (ALWAYS_IGNORE.has(entry)) continue;

      // Gitignore / codepaktignore check
      if (matchesIgnore(relPath, allPatterns)) continue;

      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }

      if (st.isDirectory()) {
        walk(fullPath);
      } else if (st.isFile()) {
        const ext = getExtension(entry);
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(relPath);
        }
      }
    }
  }

  walk(projectPath);
  return results;
}
