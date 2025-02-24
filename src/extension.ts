import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import minimatch from "minimatch"; // Corrected import

// Interface for CODEOWNERS rules
interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

// Parse the CODEOWNERS file into an array of rules
function parseCodeOwners(filePath: string): CodeOwnerRule[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
}

// Find the CODEOWNERS file in the workspace
function findCodeOwnersFile(workspaceRoot: string): string | null {
  const possiblePaths = [
    path.join(workspaceRoot, ".github", "CODEOWNERS"),
    path.join(workspaceRoot, "docs", "CODEOWNERS"),
    path.join(workspaceRoot, "CODEOWNERS"),
  ];

  return possiblePaths.find(fs.existsSync) || null;
}

// Check if a file matches any CODEOWNERS rule
function isFileOwned(filePath: string, rules: CodeOwnerRule[]): boolean {
  return rules.some((rule) => minimatch(filePath, rule.pattern));
}

// Get filtered files based on CODEOWNERS rules
async function getFilteredFiles(
  workspaceRoot: string,
  rules: CodeOwnerRule[]
): Promise<vscode.TreeItem[]> {
  const files = await vscode.workspace.findFiles("**/*");
  return files
    .filter((file) => {
      const relativePath = path.relative(workspaceRoot, file.fsPath);
      return isFileOwned(relativePath, rules);
    })
    .map((file) => new vscode.TreeItem(file.fsPath));
}

// Create a tree data provider for the CODEOWNERS view
function createTreeDataProvider(
  workspaceRoot: string,
  rules: CodeOwnerRule[]
): {
  treeDataProvider: vscode.TreeDataProvider<vscode.TreeItem>;
  refresh: () => void;
} {
  const onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();

  const treeDataProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    onDidChangeTreeData: onDidChangeTreeData.event,
    getTreeItem: (element: vscode.TreeItem) => element,
    getChildren: async (element?: vscode.TreeItem) => {
      if (!element) {
        return getFilteredFiles(workspaceRoot, rules);
      }
      return [];
    },
  };

  return {
    treeDataProvider,
    refresh: () => onDidChangeTreeData.fire(undefined), // Expose refresh functionality
  };
}

// Activate the extension
export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("No workspace opened.");
    return;
  }

  const codeOwnersFile = findCodeOwnersFile(workspaceRoot);
  if (!codeOwnersFile) {
    vscode.window.showErrorMessage("CODEOWNERS file not found.");
    return;
  }

  const codeOwnersRules = parseCodeOwners(codeOwnersFile);
  const { treeDataProvider, refresh } = createTreeDataProvider(
    workspaceRoot,
    codeOwnersRules
  );

  // Register the tree view
  vscode.window.registerTreeDataProvider("codeOwnersView", treeDataProvider);

  // Register the refresh command
  const refreshCommand = vscode.commands.registerCommand(
    "codeOwners.refresh",
    () => {
      refresh(); // Call the refresh function
    }
  );

  context.subscriptions.push(refreshCommand);
}

// Deactivate the extension (optional)
export function deactivate() {}
