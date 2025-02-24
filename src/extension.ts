import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import minimatch from "minimatch";

interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

interface TreeDataState {
  selectedOwner?: string;
}

// Get all unique code owners from rules
function getUniqueCodeOwners(rules: CodeOwnerRule[]): string[] {
  const ownersSet = new Set<string>();
  rules.forEach((rule) => {
    rule.owners.forEach((owner) => ownersSet.add(owner));
  });
  return Array.from(ownersSet).sort();
}

// Get files owned by a specific owner
function getFilesForOwner(
  filePath: string,
  rules: CodeOwnerRule[],
  owner: string
): boolean {
  return rules.some(
    (rule) => rule.owners.includes(owner) && minimatch(filePath, rule.pattern)
  );
}

// Create a tree item for a file
function createFileTreeItem(
  filePath: string,
  workspaceRoot: string
): vscode.TreeItem {
  const relativePath = path.relative(workspaceRoot, filePath);
  const treeItem = new vscode.TreeItem(
    relativePath,
    vscode.TreeItemCollapsibleState.None
  );
  treeItem.resourceUri = vscode.Uri.file(filePath);
  treeItem.command = {
    command: "vscode.open",
    title: "Open File",
    arguments: [vscode.Uri.file(filePath)],
  };
  return treeItem;
}

// Create a tree data provider
function createTreeDataProvider(workspaceRoot: string, rules: CodeOwnerRule[]) {
  let currentState: TreeDataState = {};
  const onDidChangeTreeData = new vscode.EventEmitter<void>();

  const getChildren = async (): Promise<vscode.TreeItem[]> => {
    if (!currentState.selectedOwner) {
      return [];
    }

    try {
      const files = await vscode.workspace.findFiles("**/*");
      return files
        .filter((file) => {
          const relativePath = path.relative(workspaceRoot, file.fsPath);
          return getFilesForOwner(
            relativePath,
            rules,
            currentState.selectedOwner!
          );
        })
        .map((file) => createFileTreeItem(file.fsPath, workspaceRoot));
    } catch (error) {
      console.error("Error getting children:", error);
      return [];
    }
  };

  return {
    onDidChangeTreeData: onDidChangeTreeData.event,
    getTreeItem: (element: vscode.TreeItem): vscode.TreeItem => element,
    getChildren: (): Promise<vscode.TreeItem[]> => getChildren(),
    setState: (newState: TreeDataState) => {
      currentState = { ...newState };
      onDidChangeTreeData.fire();
    },
    refresh: () => {
      onDidChangeTreeData.fire();
    },
  };
}

// Parse the CODEOWNERS file
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

// Find the CODEOWNERS file
function findCodeOwnersFile(workspaceRoot: string): string | null {
  const possiblePaths = [
    path.join(workspaceRoot, ".github", "CODEOWNERS"),
    path.join(workspaceRoot, "docs", "CODEOWNERS"),
    path.join(workspaceRoot, "CODEOWNERS"),
  ];

  return possiblePaths.find(fs.existsSync) || null;
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
  const treeDataProvider = createTreeDataProvider(
    workspaceRoot,
    codeOwnersRules
  );

  // Register the tree view
  const treeView = vscode.window.createTreeView("codeOwnersView", {
    treeDataProvider,
  });

  // Register select owner command
  const selectOwnerCommand = vscode.commands.registerCommand(
    "codeOwners.selectOwner",
    async () => {
      const owners = getUniqueCodeOwners(codeOwnersRules);
      const selectedOwner = await vscode.window.showQuickPick(owners, {
        placeHolder: "Select a code owner to filter files",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selectedOwner) {
        treeDataProvider.setState({ selectedOwner });
      }
    }
  );

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand(
    "codeOwners.refresh",
    () => {
      treeDataProvider.refresh();
    }
  );

  context.subscriptions.push(treeView, selectOwnerCommand, refreshCommand);
}

export function deactivate() {}
