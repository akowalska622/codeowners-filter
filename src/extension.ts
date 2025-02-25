import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { getCodeownersPaths, getListOfUniqueCodeowners } from "./helpers";
import { listCodeOwnersCommand } from "./listCodeOwnersCommand";
import { generateIncludePatternCommand } from "./generateIncludePatternCommand";

// Tree item type
interface TreeItem extends vscode.TreeItem {
  label: string;
  itemType: string; // "all", "owner", "directory", or "file"
  resourceUri?: vscode.Uri;
}

// State management - using module-level variables
let codeOwnersMap: Record<string, string[]> = {};
let selectedOwner: string | null = null;

// Tree data provider using function composition instead of class
const createTreeDataProvider = (): vscode.TreeDataProvider<TreeItem> => {
  // Create event emitter for tree changes
  const _onDidChangeTreeData: vscode.EventEmitter<
    TreeItem | undefined | null | void
  > = new vscode.EventEmitter<TreeItem | undefined | null | void>();

  // Refresh the code owners data
  const refreshCodeOwners = (): void => {
    codeOwnersMap = getCodeownersPaths();
  };

  // Initial data load
  refreshCodeOwners();

  // Create a tree item
  const createTreeItem = (
    label: string,
    itemType: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    resourceUri?: vscode.Uri
  ): TreeItem => {
    const item: TreeItem = {
      label,
      itemType,
      resourceUri,
      collapsibleState,
      command,
      contextValue: itemType,
    };

    // Set appropriate icon based on type
    if (itemType === "all") {
      item.iconPath = new vscode.ThemeIcon("account");
    } else if (itemType === "owner") {
      item.iconPath = new vscode.ThemeIcon("person");
    }
    // Directory and file use default icons

    return item;
  };

  // Get relative path from absolute path
  const getRelativePath = (filePath: string): string => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return filePath;

    const rootPath = workspaceFolders[0].uri.fsPath;
    return filePath.replace(rootPath + path.sep, "");
  };

  // Check if a path should be included in the current view
  const isPathIncluded = (relativePath: string): boolean => {
    if (!selectedOwner || selectedOwner === "all") return true;

    const ownerPaths = codeOwnersMap[selectedOwner] || [];

    // Normalize relativePath to ensure consistency
    relativePath = relativePath.replace(/\\/g, "/"); // Normalize backslashes on Windows

    for (const ownerPath of ownerPaths) {
      // Normalize ownerPath to ensure consistency
      let normalizedOwnerPath = ownerPath.replace(/\\/g, "/");

      // Case 1: Exact match for file/folder
      if (normalizedOwnerPath === relativePath) return true;

      // Case 2: Direct parent directory match (only direct children, no deeper subfolders)
      if (
        relativePath.startsWith(normalizedOwnerPath + "/") && // Ensure it's a child directory/file
        !relativePath.slice(normalizedOwnerPath.length + 1).includes("/") // Ensure it's not a deeper subfolder
      ) {
        return true;
      }

      // Case 3: Wildcard directory match (/*) - Match direct children only
      if (normalizedOwnerPath.endsWith("/*")) {
        const basePath = normalizedOwnerPath.slice(0, -1); // Remove the "*" from the end
        // Check if the path starts with the base path and is a direct child (no deeper subfolders)
        if (
          relativePath.startsWith(basePath + "/") && // Direct child
          !relativePath.slice(basePath.length + 1).includes("/") // No subdirectories deeper
        ) {
          return true;
        }
      }

      // Case 4: Double wildcard match (/**) - Match all descendants, including deep subdirectories
      if (normalizedOwnerPath.endsWith("/**")) {
        const basePath = normalizedOwnerPath.slice(0, -2); // Remove the "**" from the end
        if (relativePath.startsWith(basePath)) return true;
      }
    }

    // If none of the above cases matched, exclude the file
    return false;
  };

  // Create file items for a set of paths
  const createFileItems = (paths: string[]): TreeItem[] => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return [];

    const rootPath = workspaceFolders[0].uri.fsPath;
    const items: TreeItem[] = [];

    // Group paths by top-level directory
    const topDirs = new Map<string, string[]>();

    for (const relativePath of paths) {
      if (!relativePath) continue;

      const fullPath = path.join(rootPath, relativePath);

      try {
        if (fs.existsSync(fullPath)) {
          // Get the top-level directory or file name
          const parts = relativePath.split(path.sep);
          const topLevel = parts[0];

          if (!topDirs.has(topLevel)) {
            topDirs.set(topLevel, []);
          }

          topDirs.get(topLevel)!.push(relativePath);
        }
      } catch (error) {
        console.error(`Error checking path ${fullPath}:`, error);
      }
    }

    // Create items for each top-level directory/file
    for (const [dir, _] of topDirs) {
      const fullPath = path.join(rootPath, dir);

      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            items.push(
              createTreeItem(
                dir,
                "directory",
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                vscode.Uri.file(fullPath)
              )
            );
          } else {
            items.push(
              createTreeItem(
                dir,
                "file",
                vscode.TreeItemCollapsibleState.None,
                {
                  command: "vscode.open",
                  title: "Open File",
                  arguments: [vscode.Uri.file(fullPath)],
                },
                vscode.Uri.file(fullPath)
              )
            );
          }
        }
      } catch (error) {
        console.error(`Error creating item for ${fullPath}:`, error);
      }
    }

    return items;
  };

  // TreeDataProvider implementation
  return {
    onDidChangeTreeData: _onDidChangeTreeData.event,

    getTreeItem: (element: TreeItem): vscode.TreeItem => element,

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
      if (!element) {
        // Root level - show owners and an "All" option
        const owners = Object.keys(codeOwnersMap);
        const items: TreeItem[] = [];

        // Add "All" option
        items.push(
          createTreeItem(
            "All Code Owners",
            "all",
            vscode.TreeItemCollapsibleState.Collapsed,
            {
              command: "codeOwners.selectOwner",
              title: "Select All Code Owners",
              arguments: ["all"],
            }
          )
        );

        // Add individual owners
        for (const owner of owners) {
          items.push(
            createTreeItem(
              owner,
              "owner",
              vscode.TreeItemCollapsibleState.Collapsed,
              {
                command: "codeOwners.selectOwner",
                title: "Select Code Owner",
                arguments: [owner],
              }
            )
          );
        }

        return items;
      } else if (element.itemType === "all") {
        // Show all paths from all owners without duplicates
        const allPaths = new Set<string>();
        for (const paths of Object.values(codeOwnersMap)) {
          paths.forEach((p) => allPaths.add(p));
        }
        return createFileItems(Array.from(allPaths));
      } else if (element.itemType === "owner") {
        // Show paths for the selected owner
        const paths = codeOwnersMap[element.label] || [];
        return createFileItems(paths);
      } else if (element.itemType === "directory") {
        // For directory items, show their children
        const dirPath = element.resourceUri?.fsPath || "";
        try {
          if (fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()) {
            const files = fs.readdirSync(dirPath);
            const items: TreeItem[] = [];

            for (const file of files) {
              const filePath = path.join(dirPath, file);
              const relativePath = getRelativePath(filePath);

              // Only include files that belong to the current filtered view
              if (isPathIncluded(relativePath)) {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                  items.push(
                    createTreeItem(
                      file,
                      "directory",
                      vscode.TreeItemCollapsibleState.Collapsed,
                      undefined,
                      vscode.Uri.file(filePath)
                    )
                  );
                } else {
                  items.push(
                    createTreeItem(
                      file,
                      "file",
                      vscode.TreeItemCollapsibleState.None,
                      {
                        command: "vscode.open",
                        title: "Open File",
                        arguments: [vscode.Uri.file(filePath)],
                      },
                      vscode.Uri.file(filePath)
                    )
                  );
                }
              }
            }

            return items;
          }
        } catch (error) {
          console.error("Error reading directory:", error);
        }
      }

      return [];
    },
  };
};

// Function to set selected owner and refresh view
const setSelectedOwner = (
  owner: string,
  treeDataProvider: vscode.TreeDataProvider<TreeItem> & { refresh?: () => void }
): void => {
  selectedOwner = owner;
  if (treeDataProvider.refresh) {
    treeDataProvider.refresh();
  }
};

// Function to refresh the tree view data
const refreshTreeView = (
  treeDataProvider: vscode.TreeDataProvider<TreeItem> & { refresh?: () => void }
): void => {
  // Refresh code owners data
  codeOwnersMap = getCodeownersPaths();

  // Refresh the tree view
  if (treeDataProvider.refresh) {
    treeDataProvider.refresh();
  }
};

// Main activation function
export const activate = (context: vscode.ExtensionContext): void => {
  // Create the tree data provider with refresh capability
  const treeDataProvider = createTreeDataProvider();

  // Add refresh method to the provider
  const refreshableProvider = {
    ...treeDataProvider,
    refresh: () => {
      // Use the private event emitter to trigger refresh
      if ("_onDidChangeTreeData" in treeDataProvider) {
        (treeDataProvider as any)._onDidChangeTreeData.fire();
      }
    },
  };

  // Create the tree view
  const treeView = vscode.window.createTreeView("codeOwnersExplorer", {
    treeDataProvider: refreshableProvider,
    showCollapseAll: true,
  });

  // Register command to select an owner in the tree view
  const selectOwnerCommandDisposable = vscode.commands.registerCommand(
    "codeOwners.selectOwner",
    (owner: string) => {
      setSelectedOwner(owner, refreshableProvider);
    }
  );

  // Register command to refresh the tree view
  const refreshTreeViewCommandDisposable = vscode.commands.registerCommand(
    "codeOwners.refreshTreeView",
    () => {
      refreshTreeView(refreshableProvider);
    }
  );

  // Add all disposables to the context
  context.subscriptions.push(
    listCodeOwnersCommand,
    generateIncludePatternCommand,
    selectOwnerCommandDisposable,
    refreshTreeViewCommandDisposable,
    treeView
  );
};

// Deactivate function to clean up
export const deactivate = (): void => {};
