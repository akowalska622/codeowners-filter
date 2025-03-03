import * as vscode from "vscode";
import { generateIncludePatternCommand } from "./generateIncludePatternCommand";
import { registerCodeownerTreeCommand } from "./generateCodeownerTreeCommand";

export const activate = (context: vscode.ExtensionContext): void => {
  registerCodeownerTreeCommand(context);

  context.subscriptions.push(generateIncludePatternCommand);
};

export const deactivate = (): void => {};
