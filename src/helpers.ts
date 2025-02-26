import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export const getCodeownersPaths = (): Record<string, string[]> => {
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

      fileContent.split("\n").forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith("#")) {
          const parts = trimmedLine.split(/\s+/);
          let path = parts[0];
          path = path.startsWith("/") ? path.slice(1) : path;

          const owners = parts.slice(1).filter((part) => part.startsWith("@"));

          owners.forEach((owner) => {
            if (!codeownersMap[owner]) {
              codeownersMap[owner] = [];
            }
            codeownersMap[owner].push(path);
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
          console.log("return");
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
    vscode.window.showErrorMessage("Error reading CODEOWNERS file.");
    return [];
  }
};
