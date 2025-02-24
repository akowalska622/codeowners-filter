import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const getListOfUniqueCodeowners = (): string[] => {
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
      const ownersSet: Set<string> = new Set(); // Use Set to eliminate duplicates
      const lines = fileContent.split("\n");
      lines.forEach((line) => {
        const trimmedLine = line.trim();
        // Ignore comments, empty lines, and lines containing URLs or paths
        if (trimmedLine && !trimmedLine.startsWith("#")) {
          const parts = trimmedLine.split(/\s+/); // Split by spaces
          // Extract all code owners (parts that start with @)
          parts.forEach((part) => {
            if (part.startsWith("@")) {
              ownersSet.add(part);
            }
          });
        }
      });
      return Array.from(ownersSet);
    } else {
      vscode.window.showErrorMessage("No CODEOWNERS file found.");
      return [];
    }
  } catch (error) {
    vscode.window.showErrorMessage("Error reading CODEOWNERS file.");
    return [];
  }
};

export const activate = (context: vscode.ExtensionContext): void => {
  const disposable = vscode.commands.registerCommand(
    "codeOwners.listCodeOwners",
    async () => {
      const owners = getListOfUniqueCodeowners();

      if (owners.length === 0) {
        vscode.window.showInformationMessage("No code owners found.");
        return;
      }

      const selectedOwner = await vscode.window.showQuickPick(owners, {
        placeHolder: "Select a code owner to copy to clipboard",
      });

      if (selectedOwner) {
        await vscode.env.clipboard.writeText(selectedOwner);
        vscode.window.showInformationMessage(
          `Copied "${selectedOwner}" to clipboard.`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
};

// Arrow function to handle deactivation
export const deactivate = (): void => {};
