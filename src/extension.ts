import * as vscode from "vscode";
import { getCodeownersPaths, getListOfUniqueCodeowners } from "./helpers";
import { listCodeOwnersCommand } from "./listCodeOwnersCommand";
import { generateIncludePatternCommand } from "./generateIncludePatternCommand";
import { registerCodeownerTreeCommand } from "./generateCodeownerTreeCommand";

// Main activation function
export const activate = (context: vscode.ExtensionContext): void => {
  // Register the tree view and its data provider
  registerCodeownerTreeCommand(context);

  // Add all commands to the context
  context.subscriptions.push(
    listCodeOwnersCommand,
    generateIncludePatternCommand
  );
};

// Deactivate function to clean up
export const deactivate = (): void => {};
