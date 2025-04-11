import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getCodeownersPaths, getListOfUniqueCodeowners } from "./helpers";

type PathNode = {
  label: string;
  fullPath: string;
  isDirectlyOwned: boolean;
  isFile: boolean;
  children: PathNode[];
};

const createTreeItem = (
  node: PathNode,
  workspacePath: string
): vscode.TreeItem => {
  const treeItem = new vscode.TreeItem(
    node.label,
    vscode.TreeItemCollapsibleState.None
  );

  if ((node as any).contextValue === "selectCodeownerMessage") {
    treeItem.label = "Select a Codeowner to show files";
    treeItem.command = {
      command: "codeOwners.generateCodeownerTree",
      title: "Select Codeowner",
      arguments: [],
    };
    return treeItem;
  }

  const collapsibleState =
    node.children.length > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

  treeItem.tooltip = `${node.fullPath}${
    node.isDirectlyOwned ? " (directly owned)" : ""
  }`;
  treeItem.collapsibleState = collapsibleState;
  treeItem.contextValue = node.isFile
    ? node.isDirectlyOwned
      ? "ownedFile"
      : "file"
    : node.isDirectlyOwned
    ? "ownedFolder"
    : "folder";

  if (node.isFile) {
    const filePath = path.join(workspacePath, node.fullPath);
    treeItem.resourceUri = vscode.Uri.file(filePath);
    treeItem.command = {
      command: "vscode.open",
      arguments: [vscode.Uri.file(filePath)],
      title: "Open File",
    };
  } else {
    const folderPath = path.join(workspacePath, node.fullPath);
    treeItem.resourceUri = vscode.Uri.file(folderPath);
  }

  return treeItem;
};

const logDebug = (message: string, data?: any) => {
  console.log(`[CODEOWNERS DEBUG] ${message}`, data || "");
};

const isFile = (fullPath: string, workspacePath: string): boolean => {
  try {
    const stats = fs.statSync(path.join(workspacePath, fullPath));
    return stats.isFile();
  } catch (error) {
    return false;
  }
};

const matchesGlobPattern = (filePath: string, pattern: string): boolean => {
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "GLOBSTARPLACEHOLDER")
    .replace(/\*/g, "[^/]*")
    .replace(/GLOBSTARPLACEHOLDER/g, ".*");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
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

// Determine the most specific codeowner for a path
const getMostSpecificCodeowner = (
  path: string,
  codeownerPaths: Record<string, string[]>
): string | null => {
  let mostSpecificCodeowner: string | null = null;
  let longestMatchLength = -1;

  // Go through all codeowners and their paths
  for (const [codeowner, paths] of Object.entries(codeownerPaths)) {
    for (const pattern of paths) {
      // Skip if the pattern contains wildcards
      if (pattern.includes("*")) {
        continue;
      }

      // Normalize the pattern
      const normalizedPattern = pattern.startsWith("/")
        ? pattern.substring(1)
        : pattern;

      // Check if this path is a prefix of our target path
      if (
        path === normalizedPattern ||
        path.startsWith(normalizedPattern + "/")
      ) {
        // Check if this is a more specific match than what we've found so far
        if (normalizedPattern.length > longestMatchLength) {
          longestMatchLength = normalizedPattern.length;
          mostSpecificCodeowner = codeowner;
        }
      }
    }
  }

  return mostSpecificCodeowner;
};

// Expand wildcard patterns in paths and find matching files
const expandGlobPatterns = (
  paths: string[],
  workspacePath: string
): string[] => {
  const expandedPaths: string[] = [];
  const processedPatterns: string[] = [];

  for (const pathPattern of paths) {
    // Normalize the path (remove leading slash)
    const normalizedPath = pathPattern.startsWith("/")
      ? pathPattern.substring(1)
      : pathPattern;

    // Check if this path contains a wildcard pattern
    if (normalizedPath.includes("*")) {
      logDebug(`Found wildcard pattern: ${normalizedPath}`);
      processedPatterns.push(normalizedPath);

      // Get the directory part of the path (everything before the last slash)
      const lastSlashIndex = normalizedPath.lastIndexOf("/");
      let dirPath = "";
      let filePattern = normalizedPath;

      if (lastSlashIndex !== -1) {
        dirPath = normalizedPath.substring(0, lastSlashIndex);
        filePattern = normalizedPath.substring(lastSlashIndex + 1);
      }

      // Get all files from this directory (recursively if pattern includes **)
      const shouldRecurse = normalizedPath.includes("**");
      const baseDir = dirPath || ".";
      const files = getFilesInDirectory(baseDir, workspacePath, shouldRecurse);

      // Filter files that match the pattern
      for (const file of files) {
        if (matchesGlobPattern(file, normalizedPath)) {
          expandedPaths.push(file);
        }
      }

      // Also add the directory itself as it's directly owned
      if (dirPath) {
        expandedPaths.push(dirPath);
      }
    } else {
      // No wildcard, add as is
      expandedPaths.push(normalizedPath);
    }
  }

  // Return unique paths
  return [...new Set(expandedPaths)];
};

const buildPathTree = (
  paths: string[],
  workspacePath: string,
  codeownerPaths: Record<string, string[]>,
  currentCodeowner: string
): PathNode[] => {
  const nodeMap = new Map<string, PathNode>();
  const rootNodes: PathNode[] = [];

  const expandedPaths = expandGlobPatterns(paths, workspacePath);
  logDebug(`Expanded paths:`, expandedPaths);

  expandedPaths.forEach((pathStr) => {
    if (pathStr.includes("*")) {
      return;
    }

    const normalizedPath = pathStr.startsWith("/")
      ? pathStr.substring(1)
      : pathStr;

    // Check if this is a directory path that needs to be expanded further
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

  // Process all paths (expanded from globs + directory contents)
  const uniquePaths = [...new Set(expandedPaths)];
  uniquePaths.forEach((pathStr) => {
    // Skip if this path still contains a wildcard (shouldn't happen at this point)
    if (pathStr.includes("*")) {
      return;
    }

    // Normalize the path (remove leading slash)
    const cleanPath = pathStr.startsWith("/") ? pathStr.substring(1) : pathStr;
    if (!cleanPath) {
      return;
    } // Skip empty paths

    // Check if this path belongs to a more specific codeowner
    const mostSpecificCodeowner = getMostSpecificCodeowner(
      cleanPath,
      codeownerPaths
    );

    // Skip this path if it belongs to a different codeowner
    if (mostSpecificCodeowner && mostSpecificCodeowner !== currentCodeowner) {
      logDebug(
        `Skipping ${cleanPath} as it belongs to ${mostSpecificCodeowner}`
      );
      return;
    }

    // First create all directory nodes for this path
    const segments = cleanPath.split("/").filter(Boolean);
    const isPathFile = isFile(cleanPath, workspacePath);

    // Process each segment of the path, creating nodes as needed
    segments.reduce((parentPath, segment, index) => {
      const currentPath = parentPath ? `${parentPath}/${segment}` : segment;
      const isLastSegment = index === segments.length - 1;
      const isFileSegment = isLastSegment && isPathFile;

      // Check if this segment path belongs to a more specific codeowner
      if (parentPath) {
        const segmentSpecificCodeowner = getMostSpecificCodeowner(
          currentPath,
          codeownerPaths
        );
        if (
          segmentSpecificCodeowner &&
          segmentSpecificCodeowner !== currentCodeowner
        ) {
          // Don't mark this as directly owned if a more specific rule assigns it to another codeowner
          return currentPath;
        }
      }

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
      if (!a.isFile && b.isFile) {
        return -1;
      }
      if (a.isFile && !b.isFile) {
        return 1;
      }

      // Then sort alphabetically
      return a.label.localeCompare(b.label);
    });
  }

  // Sort root nodes the same way
  rootNodes.sort((a, b) => {
    if (!a.isFile && b.isFile) {
      return -1;
    }
    if (a.isFile && !b.isFile) {
      return 1;
    }
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

      // Pass the entire codeownerPaths object to buildPathTree for rule precedence checking
      rootNodes = buildPathTree(
        paths,
        workspacePath,
        codeownerPaths,
        currentCodeowner
      );
      onDidChangeTreeDataEmitter.fire(undefined);
    },

    getTreeItem: (element: any): vscode.TreeItem => {
      return element;
    },

    getChildren: (element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> => {
      if (!currentCodeowner) {
        // If no codeowner is selected, show a message and a button
        const messageItem = new vscode.TreeItem(
          "Select a Codeowner to show files",
          vscode.TreeItemCollapsibleState.None
        );
        messageItem.command = {
          command: "codeOwners.generateCodeownerTree",
          title: "Select Codeowner",
          arguments: [],
        };
        messageItem.contextValue = "selectCodeownerMessage"; // You can style it differently if needed
        return Promise.resolve([messageItem]);
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
