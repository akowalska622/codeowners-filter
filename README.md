# 📂 CodeOwners Filter

**CodeOwners Filter** is a Visual Studio Code extension that gives you a visual representation of the `CODEOWNERS` file and helps you generate glob include patterns for any code owner. Whether you're maintaining a large monorepo or just want to quickly see who owns what, this tool simplifies code ownership visibility and automation.

## 🚀 Features

- 🌳 **Tree View of Code Owners**  
  See all owners and their files in a collapsible tree grouped by owner.

- ✂️ **Generate Include Patterns**  
  Easily generate glob patterns to include all files owned by a specific owner — perfect for use in GitHub Actions, linters, or other automation tools.

- 📂 **Pattern-Aware File Matching**  
  Supports all common CODEOWNERS glob syntax, including `*`, `**`, `/`, and file extensions.

- 🔄 **Live Updates**  
  Automatically re-parses the CODEOWNERS file when it changes.

## 📦 Installation

Since this extension is currently for internal use only, you'll need to install it locally:

1. (Optional, if not installed already) Install `vsce` CLI:

   ```bash
   npm install -g @vscode/vsce
   ```

2. Clone this repository:

   ```bash
   git clone https://github.com/akowalska622/codeowners-filter
   cd codeowners-filter
   ```

3. Install dependencies and build (optional, `vsce` should take care of that):

   ```bash
   npm install
   npm run compile
   ```

4. Package the extension:

   ```bash
   vsce package
   ```

   This will create a `.vsix` file in your project directory.

5. Install in VS Code:
   - Open VS Code
   - Press `Cmd+Shift+P` to open the Command Palette
   - Type "Install from VSIX" and select it
   - Choose the `.vsix` file you just created
   - Reload VS Code when prompted

&nbsp;

> 💡 **Coming Soon**: Once published, you'll be able to install directly from the VS Code Marketplace:
>
> 1. Open VS Code
> 2. Go to the Extensions panel (`Cmd+Shift+X`)
> 3. Search for `CodeOwners Filter`
> 4. Click **Install**
> 5. Reload VS Code

## 🎯 Usage

### View Files by Owner

1. Open the **Codeowner Files** view in the Explorer sidebar
2. Click the 👥 icon in the view header to select a code owner
3. Browse the tree view to see all files owned by that team/person

### Generate Include Patterns

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run `Code Owners: Generate Include Pattern and Search`
3. Select a code owner from the list
4. The pattern will be copied to your clipboard and a search will open with the files

### Refresh Tree View

- Click the 🔄 icon in the view header
- The tree will update to reflect any changes in the CODEOWNERS file

## 🛠️ Commands

- `codeOwners.generateCodeownerTree`: Select a code owner to view their files in the tree
- `codeOwners.generateIncludePattern`: Generate a glob pattern for files owned by a team
- `codeOwners.refreshTreeView`: Refresh the tree view

## ⚙️ Requirements

- VS Code 1.97.0 or newer
- A `.github/CODEOWNERS` file in your workspace

## 🤝 Contributing

Feel free to:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🗺️ Roadmap

### Upcoming Features

1. 🖱️ **Context menu**

   - Context menu for tree view, similar to the native one

2. 🎯 **Enhanced Pattern Matching**

   - Migrate to `minimatch` for more reliable glob pattern handling
   - Support for negative patterns (e.g., `!exclude/this/**`)
   - Improved performance for large codebases

3. ✂️ **Advanced Filtering**

   - Add exclude patterns alongside include patterns
   - Support for combining multiple owners

4. 🚀 **Future Ideas**
   - Statistics dashboard showing ownership distribution
   - Your suggestions!

## 📄 License

This project is licensed under the MIT License.

## 👤 Author

Anna Kowalska
