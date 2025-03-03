import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface CodeOwnerEntry {
  pattern: string;
  owners: string[];
  specificity: number;
}

/**
 * Get paths owned by each code owner, respecting pattern specificity.
 * Handles nested ownership rules correctly.
 */
export const getCodeownersPaths = (): Record<string, string[]> => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace is open.");
    return {};
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const codeownersFilePath = path.join(workspacePath, ".github", "CODEOWNERS");

  const codeownersMap: Record<string, string[]> = {};

  try {
    if (!fs.existsSync(codeownersFilePath)) {
      vscode.window.showErrorMessage("No CODEOWNERS file found.");
      return {};
    }

    const fileContent = fs.readFileSync(codeownersFilePath, "utf-8");
    const entries: CodeOwnerEntry[] = [];

    // Parse CODEOWNERS file into structured entries with specificity
    fileContent.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        const parts = trimmedLine.split(/\s+/);
        let pattern = parts[0];
        pattern = pattern.startsWith("/") ? pattern.slice(1) : pattern;

        const owners = parts.slice(1).filter((part) => part.startsWith("@"));

        // Calculate specificity - more segments and wildcards increase specificity
        const specificity = calculateSpecificity(pattern);

        entries.push({ pattern, owners, specificity });
      }
    });

    // Sort entries by specificity (descending)
    entries.sort((a, b) => b.specificity - a.specificity);

    // Initialize owner-to-patterns map
    const ownerPatternsMap: Record<string, string[]> = {};
    entries.forEach((entry) => {
      entry.owners.forEach((owner) => {
        if (!ownerPatternsMap[owner]) {
          ownerPatternsMap[owner] = [];
        }
        ownerPatternsMap[owner].push(entry.pattern);
      });
    });

    // For each owner, calculate effective patterns
    Object.keys(ownerPatternsMap).forEach((owner) => {
      const patterns = ownerPatternsMap[owner];
      const effectivePatterns = calculateEffectivePatterns(patterns, entries);
      codeownersMap[owner] = effectivePatterns;
    });

    return codeownersMap;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error reading CODEOWNERS file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {};
  }
};

/**
 * Calculate effective patterns for an owner, excluding paths that are owned by more specific rules
 */
function calculateEffectivePatterns(
  ownerPatterns: string[],
  allEntries: CodeOwnerEntry[]
): string[] {
  const effectivePatterns: string[] = [];
  const excludedPatterns: string[] = [];

  // For each pattern owned by this owner
  for (const pattern of ownerPatterns) {
    let shouldInclude = true;

    // Find the entry for this pattern
    const patternEntry = allEntries.find((e) => e.pattern === pattern);
    if (!patternEntry) continue;

    // Check if this pattern is overridden by a more specific one in another entry
    for (const entry of allEntries) {
      // Skip if it's the same pattern or less specific
      if (
        entry.pattern === pattern ||
        entry.specificity <= patternEntry.specificity
      ) {
        continue;
      }

      // If this more specific pattern is a subpath of our pattern
      // and this owner is not in its owners list, we need to exclude it
      if (
        isSubpath(pattern, entry.pattern) &&
        !entry.owners.some((o) => ownerPatterns.includes(entry.pattern))
      ) {
        excludedPatterns.push(entry.pattern);
        shouldInclude = false;
      }
    }

    if (shouldInclude) {
      effectivePatterns.push(pattern);
    }
  }

  // Return patterns, excluding those that should be skipped
  return effectivePatterns.filter(
    (pattern) =>
      !excludedPatterns.some((excluded) => isSubpath(pattern, excluded))
  );
}

/**
 * Check if childPath is a subpath of parentPath
 */
function isSubpath(parentPath: string, childPath: string): boolean {
  // Replace wildcards with regex for comparison
  const parentRegex = new RegExp(`^${parentPath.replace(/\*/g, ".*")}`);
  return parentRegex.test(childPath);
}

/**
 * Calculate specificity of a pattern - higher is more specific
 */
function calculateSpecificity(pattern: string): number {
  // Count path segments (more segments = more specific)
  const segments = pattern.split("/").filter(Boolean).length;

  // Base specificity on segment count
  let specificity = segments * 100;

  // More specific if no wildcards
  if (!pattern.includes("*")) {
    specificity += 50;
  }

  // More specific if it's an exact file path (has extension)
  if (pattern.includes(".") && !pattern.endsWith("/")) {
    specificity += 25;
  }

  return specificity;
}

/**
 * Get a list of all unique code owners
 */
export const getListOfUniqueCodeowners = (): string[] => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace is open.");
    return [];
  }

  const codeownersFilePath = path.join(
    workspaceFolders[0].uri.fsPath,
    ".github",
    "CODEOWNERS"
  );

  try {
    if (fs.existsSync(codeownersFilePath)) {
      const fileContent = fs.readFileSync(codeownersFilePath, "utf-8");
      const teams = new Set<string>();

      fileContent.split("\n").forEach((line) => {
        let trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) {
          // Removed console.log("return")
          return; // Ignore empty and comment lines
        }

        // Remove inline comments (anything after #)
        trimmedLine = trimmedLine.split("#")[0].trim();

        // Extract owners (skip the first word as it's the path)
        const lineTeams = trimmedLine
          .split(/\s+/)
          .slice(1)
          .map((team) => team.replace(/[^@\w/-]+$/, "").trim()) // Remove trailing punctuation
          .filter((team) => team.startsWith("@"));

        lineTeams.forEach((team) => teams.add(team));
      });

      return Array.from(teams);
    } else {
      vscode.window.showErrorMessage("No CODEOWNERS file found.");
      return [];
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error reading CODEOWNERS file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }
};

/**
 * Format patterns for inclusion in a search query
 */
export const formatPatternsForInclude = (patterns: string[]): string => {
  if (patterns.length <= 3) {
    return patterns.join(",");
  }

  // Group patterns by directory prefix for cleaner output
  const groupedPatterns: Record<string, string[]> = {};
  for (const pattern of patterns) {
    const baseDir = pattern.split("/")[0];
    if (!groupedPatterns[baseDir]) {
      groupedPatterns[baseDir] = [];
    }
    groupedPatterns[baseDir].push(pattern);
  }

  // Format groups into search patterns
  const result: string[] = [];
  for (const [baseDir, dirPatterns] of Object.entries(groupedPatterns)) {
    if (dirPatterns.length > 3) {
      // If there are many patterns in a directory, use a wildcard
      result.push(`${baseDir}/**`);
    } else {
      // Otherwise, list individual patterns
      result.push(...dirPatterns);
    }
  }

  return result.join(",");
};
