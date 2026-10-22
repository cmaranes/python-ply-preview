# Change Log

All notable changes to the "python-ply-preview" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.


### 0.1.1

  * Preview files left behind when VS Code was closed during a debug session are now removed after a day.

### 0.1.0

  * The PLY file is now written only when you click **View PLY**, not every time the cursor moves. This makes the debugger much more responsive with large point clouds.
  * Files are now saved as binary PLY, which is much faster and smaller than ASCII.
  * New entry points: right-click in the **Variables** / **Watch** panels, the editor context menu, and the Command Palette.
  * You can select an expression such as `pcd.points` or `batch[0]` to preview it.
  * Uses the stack frame selected in the Call Stack instead of always the top frame of the first thread.
  * Added support for `(n, 4)` XYZ + intensity, channels-first and `(1, n, c)` batched layouts, and `uint8` colors. Also added support for Open3D tensor-API point clouds.
  * Dropped the `open3d` requirement: only `numpy` is needed. Non-finite points are filtered out.
  * Requires VS Code 1.90 or newer.

### 0.0.8

  * Resolved Dependabot security alerts by updating vulnerable dev dependencies (mocha, eslint toolchain, and transitive packages).

### 0.0.7

  * Replaced heavy Open3D dependency with pure NumPy and Python file I/O for array saving.
  * Fixed a critical bug causing timeouts (`Cannot evaluate expression`) on macOS due to slow library loading.
  * Improved robustness across different Python versions.

### 0.0.6

  * Removed the requirement to import `open3d` in the user script beforehand.
  * Added automatic library check (Open3D, NumPy, PyTorch) and user notification if missing.
  * Modified README.md to include Visual Studio Marketplace badges.

### 0.0.4

  * Added support for PyTorch Tensors and NumPy arrays with color `(n, 6)`.
  * Changed temporary file location to `.vscode/ply_preview`.
  * Implemented automatic cleanup of temporary files after a debug session.
  * Improved logic to avoid activating on variables in comments or strings.

### 0.0.3

  * The `__pycache__` folder is now created if it doesn't exist.

### 0.0.2

  * Fixed extension description and name.
  * Added marketplace badges to the README.

### 0.0.1

  * Initial release.
