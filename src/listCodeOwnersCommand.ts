import * as vscode from "vscode";

import { getListOfUniqueCodeowners } from "./helpers";

export const listCodeOwnersCommand = vscode.commands.registerCommand(
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
