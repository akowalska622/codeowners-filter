import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// Function to get unique code owners (no paths, only code owners) using the Set-based approach
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

      // Use a Set to collect unique code owners (teams)
      const teams = new Set<string>();

      // Split the file content by new lines and process each line
      fileContent.split("\n").forEach((line) => {
        const lineTeams = line
          .trim()
          .split(/\s+/) // Split by spaces
          .slice(1) // Skip the first item (the path)
          .filter((part) => part.startsWith("@")); // Only include code owners (starts with @)

        // Add each team to the Set (duplicates will be removed automatically)
        lineTeams.forEach((team) => teams.add(team));
      });

      // Return the unique code owners as an array
      return Array.from(teams); // Convert the Set to an array for returning
    } else {
      vscode.window.showErrorMessage("No CODEOWNERS file found.");
      return [];
    }
  } catch (error) {
    vscode.window.showErrorMessage("Error reading CODEOWNERS file.");
    return [];
  }
};

// Function to get code owners and their associated paths
const getCodeownersPaths = (): Record<string, string[]> => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace is open.");
    return {};
  }

  const codeownersFilePath = path.join(
    workspaceFolders[0].uri.fsPath,
    ".github",
    "CODEOWNERS"
  );

  const codeownersMap: Record<string, string[]> = {};

  try {
    if (fs.existsSync(codeownersFilePath)) {
      const fileContent = fs.readFileSync(codeownersFilePath, "utf-8");

      // Process each line in the CODEOWNERS file
      fileContent.split("\n").forEach((line) => {
        const trimmedLine = line.trim();
        // Ignore comments and empty lines
        if (trimmedLine && !trimmedLine.startsWith("#")) {
          const parts = trimmedLine.split(/\s+/); // Split by spaces
          let path = parts[0]; // Path associated with the owner

          // Remove leading '/' from the path if present
          path = path.startsWith("/") ? path.slice(1) : path;

          // Extract all code owners (parts that start with @)
          const owners = parts.slice(1).filter((part) => part.startsWith("@"));

          owners.forEach((owner) => {
            if (!codeownersMap[owner]) {
              codeownersMap[owner] = [];
            }
            codeownersMap[owner].push(path); // Add path to code owner
          });
        }
      });
    } else {
      vscode.window.showErrorMessage("No CODEOWNERS file found.");
    }
  } catch (error) {
    vscode.window.showErrorMessage("Error reading CODEOWNERS file.");
  }

  return codeownersMap;
};

// Activate function to register commands
export const activate = (context: vscode.ExtensionContext): void => {
  // Register the "listCodeOwners" command
  const listCodeOwnersCommandDisposable = vscode.commands.registerCommand(
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
        // Copy the selected owner to clipboard (not paths)
        await vscode.env.clipboard.writeText(selectedOwner);
        vscode.window.showInformationMessage(
          `Copied "${selectedOwner}" to clipboard.`
        );
      }
    }
  );

  context.subscriptions.push(listCodeOwnersCommandDisposable);

  // Register the "generateIncludePattern" command to generate paths for the selected code owner
  const generateIncludePatternCommandDisposable =
    vscode.commands.registerCommand(
      "codeOwners.generateIncludePattern",
      async () => {
        const codeownersMap = getCodeownersPaths();

        const owners = Object.keys(codeownersMap);
        if (owners.length === 0) {
          vscode.window.showInformationMessage("No code owners found.");
          return;
        }

        // Prompt the user to select a code owner
        const selectedOwner = await vscode.window.showQuickPick(owners, {
          placeHolder: "Select a code owner to generate include pattern",
        });

        if (selectedOwner) {
          // Get the paths associated with the selected owner and join them into a comma-separated string
          const paths = codeownersMap[selectedOwner].join(",");

          // Copy the paths to the clipboard
          await vscode.env.clipboard.writeText(paths);

          // Show success message
          vscode.window.showInformationMessage(
            `Generated pattern (paths for "${selectedOwner}") and copied it to clipboard: ${paths}`
          );
        }
      }
    );

  context.subscriptions.push(generateIncludePatternCommandDisposable);
};

// Deactivate function to clean up
export const deactivate = (): void => {};
