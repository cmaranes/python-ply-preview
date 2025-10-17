# Change Log

All notable changes to the "python-ply-preview" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
