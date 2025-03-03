import * as vscode from "vscode";

import { getCodeownersPaths } from "./helpers";

export const generateIncludePatternCommand = vscode.commands.registerCommand(
  "codeOwners.generateIncludePattern",
  async () => {
    const codeownersMap = getCodeownersPaths();

    const owners = Object.keys(codeownersMap);
    if (owners.length === 0) {
      vscode.window.showInformationMessage("No code owners found.");
      return;
    }

    const selectedOwner = await vscode.window.showQuickPick(owners, {
      placeHolder: "Select a code owner to generate include pattern",
    });

    if (selectedOwner) {
      const paths = codeownersMap[selectedOwner];

      // Format paths for inclusion pattern
      let includePattern: string;

      if (paths.length <= 3) {
        // For few paths, just join them with commas
        includePattern = paths.join(",");
      } else {
        // For many paths, group by common directories to make it more manageable
        includePattern = groupPathsForPattern(paths);
      }

      await vscode.env.clipboard.writeText(includePattern);

      vscode.window.showInformationMessage(
        `Generated pattern for "${selectedOwner}" and copied it to clipboard`
      );

      vscode.commands.executeCommand("workbench.action.findInFiles", {
        query: "",
        filesToInclude: includePattern,
        triggerSearch: true,
      });
    }
  }
);

// Helper to group paths by common directories for better include patterns
const groupPathsForPattern = (paths: string[]): string => {
  // Group paths by directory
  const dirGroups: Record<string, string[]> = {};

  for (const filePath of paths) {
    const dir = filePath.split("/").slice(0, -1).join("/");
    if (!dirGroups[dir]) {
      dirGroups[dir] = [];
    }
    dirGroups[dir].push(filePath);
  }

  // For directories with many files, use wildcards
  const patterns: string[] = [];

  for (const [dir, files] of Object.entries(dirGroups)) {
    if (files.length > 3) {
      // If most files in a directory are included, use a wildcard
      patterns.push(`${dir}/**`);
    } else {
      // Otherwise, list individual files
      patterns.push(...files);
    }
  }

  return patterns.join(",");
};
