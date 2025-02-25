import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getCodeownersPaths, getListOfUniqueCodeowners } from "./helpers";

// Define types for our tree structure
type PathNode = {
  label: string;
  fullPath: string;
  isDirectlyOwned: boolean;
  isFile: boolean;
  children: PathNode[];
};

// Create TreeItem from PathNode
const createTreeItem = (
  node: PathNode,
  workspacePath: string
): vscode.TreeItem => {
  const collapsibleState =
    node.children.length > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

  const treeItem = new vscode.TreeItem(node.label, collapsibleState);

  // Set common properties
  treeItem.tooltip = `${node.fullPath}${
    node.isDirectlyOwned ? " (directly owned)" : ""
  }`;

  // Set command to open file on click
  if (node.isFile) {
    const filePath = path.join(workspacePath, node.fullPath);
    treeItem.command = {
      command: "vscode.open",
      arguments: [vscode.Uri.file(filePath)],
      title: "Open File",
    };
  }

  // Different styling for files vs directories and owned vs not owned
  if (node.isFile) {
    // Use resourceUri for correct file icons that inherit from theme
    const filePath = path.join(workspacePath, node.fullPath);
    treeItem.resourceUri = vscode.Uri.file(filePath);
    treeItem.contextValue = node.isDirectlyOwned ? "ownedFile" : "file";
    treeItem.description = node.isDirectlyOwned ? "(directly owned)" : "";
  } else {
    // Use resourceUri for folders too to inherit theme
    const folderPath = path.join(workspacePath, node.fullPath);
    treeItem.resourceUri = vscode.Uri.file(folderPath);
    treeItem.contextValue = node.isDirectlyOwned ? "ownedFolder" : "folder";
    treeItem.description = node.isDirectlyOwned ? "(directly owned)" : "";
  }

  return treeItem;
};

// Log function for debugging
const logDebug = (message: string, data?: any) => {
  console.log(`[CODEOWNERS DEBUG] ${message}`, data || "");
};

// Check if a path exists and is a file
const isFile = (fullPath: string, workspacePath: string): boolean => {
  try {
    const stats = fs.statSync(path.join(workspacePath, fullPath));
    return stats.isFile();
  } catch (error) {
    // Path doesn't exist or can't be accessed
    return false;
  }
};

// Get files in a directory (recursive option)
const getFilesInDirectory = (
  directoryPath: string,
  workspacePath: string,
  recursive: boolean = false
): string[] => {
  try {
    const fullPath = path.join(workspacePath, directoryPath);
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return [];
    }

    const files: string[] = [];
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = path.join(directoryPath, entry.name);

      if (entry.isFile()) {
        files.push(relativePath);
      } else if (recursive && entry.isDirectory()) {
        const subFiles = getFilesInDirectory(
          relativePath,
          workspacePath,
          recursive
        );
        files.push(...subFiles);
      }
    }

    return files;
  } catch (error) {
    logDebug(`Error reading directory ${directoryPath}:`, error);
    return [];
  }
};

// Create a tree structure from a flat list of paths with files and directories
const buildPathTree = (paths: string[], workspacePath: string): PathNode[] => {
  // Use a map to track created nodes
  const nodeMap = new Map<string, PathNode>();
  const rootNodes: PathNode[] = [];

  // Special handling for deep directories like /x-pack/solutions/security/...
  const expandedPaths = [...paths];

  // Process specific paths that may need special handling
  paths.forEach((pathStr) => {
    // Normalize the path (remove leading slash)
    const normalizedPath = pathStr.startsWith("/")
      ? pathStr.substring(1)
      : pathStr;

    // Check if this is a directory path
    try {
      const fullPath = path.join(workspacePath, normalizedPath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        // Add subdirectories and files to the paths list
        logDebug(`Expanding directory: ${normalizedPath}`);
        const directoryFiles = getFilesInDirectory(
          normalizedPath,
          workspacePath,
          true
        );
        expandedPaths.push(...directoryFiles);
      }
    } catch (error) {
      // Skip on error
    }
  });

  // Process all paths (original + expanded)
  expandedPaths.forEach((pathStr) => {
    // Normalize the path (remove leading slash)
    const cleanPath = pathStr.startsWith("/") ? pathStr.substring(1) : pathStr;
    if (!cleanPath) return; // Skip empty paths

    // First create all directory nodes for this path
    const segments = cleanPath.split("/").filter(Boolean);
    const isPathFile = isFile(cleanPath, workspacePath);

    // Process each segment of the path, creating nodes as needed
    segments.reduce((parentPath, segment, index) => {
      const currentPath = parentPath ? `${parentPath}/${segment}` : segment;
      const isLastSegment = index === segments.length - 1;
      const isFileSegment = isLastSegment && isPathFile;

      // Check if the node already exists
      if (!nodeMap.has(currentPath)) {
        const newNode: PathNode = {
          label: segment,
          fullPath: currentPath,
          isDirectlyOwned: isLastSegment, // Only mark as directly owned if it's the exact path
          isFile: isFileSegment,
          children: [],
        };

        nodeMap.set(currentPath, newNode);

        // Add to parent's children or to root nodes
        if (parentPath) {
          const parentNode = nodeMap.get(parentPath);
          if (parentNode) {
            parentNode.children.push(newNode);
          }
        } else {
          rootNodes.push(newNode);
        }
      } else if (isLastSegment) {
        // If the node already exists, update its properties
        const existingNode = nodeMap.get(currentPath);
        if (existingNode) {
          existingNode.isDirectlyOwned = true;
          // Only update isFile if it's actually a file
          if (isFileSegment) {
            existingNode.isFile = true;
          }
        }
      }

      return currentPath;
    }, "");
  });

  // Sort children alphabetically with directories first, then files
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => {
      // First sort by type: directories before files
      if (!a.isFile && b.isFile) return -1;
      if (a.isFile && !b.isFile) return 1;

      // Then sort alphabetically
      return a.label.localeCompare(b.label);
    });
  }

  // Sort root nodes the same way
  rootNodes.sort((a, b) => {
    if (!a.isFile && b.isFile) return -1;
    if (a.isFile && !b.isFile) return 1;
    return a.label.localeCompare(b.label);
  });

  return rootNodes;
};

// Create the tree data provider using functional patterns
const createCodeownerTreeDataProvider = () => {
  // State
  let currentCodeowner = "";
  let rootNodes: PathNode[] = [];
  let workspacePath = "";

  // Event emitter for tree changes
  const onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();

  // Return the tree data provider object
  return {
    onDidChangeTreeData: onDidChangeTreeDataEmitter.event,

    getCurrentCodeowner: (): string => {
      return currentCodeowner;
    },

    refresh: (codeowner: string): void => {
      currentCodeowner = codeowner;

      // Get workspace path
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace is open.");
        return;
      }
      workspacePath = workspaceFolders[0].uri.fsPath;

      const codeownerPaths = getCodeownersPaths();
      const paths = codeownerPaths[codeowner] || [];

      rootNodes = buildPathTree(paths, workspacePath);
      onDidChangeTreeDataEmitter.fire(undefined);
    },

    getTreeItem: (element: any): vscode.TreeItem => {
      return element;
    },

    getChildren: (element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> => {
      if (!currentCodeowner) {
        return Promise.resolve([]);
      }

      if (!element) {
        // Root level - return the root nodes converted to TreeItems
        return Promise.resolve(
          rootNodes.map((node) => {
            const item = createTreeItem(node, workspacePath);
            // Store the node with the TreeItem for retrieving children later
            (item as any).node = node;
            return item;
          })
        );
      } else {
        // Child level - return children of this element
        const node = (element as any).node as PathNode;
        if (node && node.children.length > 0) {
          return Promise.resolve(
            node.children.map((childNode) => {
              const item = createTreeItem(childNode, workspacePath);
              (item as any).node = childNode;
              return item;
            })
          );
        }
        return Promise.resolve([]);
      }
    },
  };
};

// Command to select a codeowner and generate the tree view
const selectCodeowner = async () => {
  const codeowners = getListOfUniqueCodeowners();

  if (codeowners.length === 0) {
    vscode.window.showErrorMessage(
      "No codeowners found in the CODEOWNERS file."
    );
    return;
  }

  const selectedCodeowner = await vscode.window.showQuickPick(codeowners, {
    placeHolder: "Select a codeowner to view files",
  });

  if (!selectedCodeowner) {
    return; // User cancelled the selection
  }

  // Refresh the tree view with the selected codeowner
  codeownerTreeProvider.refresh(selectedCodeowner);

  // Update the tree view title to include the selected codeowner
  updateTreeViewTitle(selectedCodeowner);
};

// Helper function to update the tree view title
const updateTreeViewTitle = (codeowner: string) => {
  const treeView = vscode.window.createTreeView(
    "kibanaCodeowners.codeownerTree",
    {
      treeDataProvider: codeownerTreeProvider as vscode.TreeDataProvider<any>,
      showCollapseAll: true,
    }
  );

  // Update the tree view title to include the selected codeowner
  treeView.title = `Codeowner: ${codeowner}`;
};

// Command to refresh the tree view
const refreshTreeView = async () => {
  const currentCodeowner = codeownerTreeProvider.getCurrentCodeowner();

  if (currentCodeowner) {
    // If a codeowner is already selected, just refresh it
    codeownerTreeProvider.refresh(currentCodeowner);
    updateTreeViewTitle(currentCodeowner);
    return;
  }

  // Otherwise, prompt the user to select a codeowner
  const codeowners = getListOfUniqueCodeowners();

  if (codeowners.length === 0) {
    vscode.window.showErrorMessage(
      "No codeowners found in the CODEOWNERS file."
    );
    return;
  }

  const selectedCodeowner = await vscode.window.showQuickPick(codeowners, {
    placeHolder: "Select a codeowner to refresh tree view",
  });

  if (selectedCodeowner) {
    codeownerTreeProvider.refresh(selectedCodeowner);
    updateTreeViewTitle(selectedCodeowner);
  }
};

// Create and register the tree data provider
const codeownerTreeProvider = createCodeownerTreeDataProvider();

// Export the command registration function
export const registerCodeownerTreeCommand = (
  context: vscode.ExtensionContext
): void => {
  // Register the tree data provider
  const treeView = vscode.window.createTreeView(
    "kibanaCodeowners.codeownerTree",
    {
      treeDataProvider: codeownerTreeProvider as vscode.TreeDataProvider<any>,
      showCollapseAll: true,
    }
  );

  const selectCodeownerCommand = vscode.commands.registerCommand(
    "codeOwners.generateCodeownerTree",
    selectCodeowner
  );

  const refreshCommand = vscode.commands.registerCommand(
    "codeOwners.refreshTreeView",
    refreshTreeView
  );

  context.subscriptions.push(selectCodeownerCommand, refreshCommand, treeView);
};

export const refreshCodeownerTree = (codeowner: string): void => {
  codeownerTreeProvider.refresh(codeowner);
  updateTreeViewTitle(codeowner);
};
