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
      const paths = codeownersMap[selectedOwner].join(",");
      await vscode.env.clipboard.writeText(paths);

      vscode.window.showInformationMessage(
        `Generated pattern (paths for "${selectedOwner}") and copied it to clipboard: ${paths}`
      );

      vscode.commands.executeCommand("workbench.action.findInFiles", {
        query: "",
        filesToInclude: paths,
        triggerSearch: true,
      });
    }
  }
);
