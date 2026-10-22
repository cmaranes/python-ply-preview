# VSCode Python PLY Preview

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/cmaranes.python-ply-preview)](https://marketplace.visualstudio.com/items?itemName=cmaranes.python-ply-preview)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/cmaranes.python-ply-preview)

🚀 Instantly visualize 3D point clouds from your Python debugger in VS Code\!

This extension enhances your debugging workflow by letting you preview point cloud variables in a 3D viewer right next to your code. It supports native **Open3D** point clouds, **NumPy** arrays, and **PyTorch** tensors, and needs no other extension.

**See it on the VS Marketplace:** [Python PLY Preview](https://marketplace.visualstudio.com/items?itemName=cmaranes.python-ply-preview)

-----

## How to Use

1.  Set a breakpoint in your Python code.
2.  Start your program in **Debug Mode** (F5).
3.  When execution pauses, open a point cloud in any of these ways:
    * Put the cursor on a variable (or **select an expression** such as `pcd.points` or `batch[0]`) and pick **View PLY** from the lightbulb / quick fix menu (`Ctrl+.`).
    * Right-click a variable in the **Variables** or **Watch** panel and pick **View as Point Cloud (PLY)**.
    * Right-click in the editor, or run **Python PLY Preview: View as Point Cloud (PLY)** from the Command Palette.
4.  The point cloud opens in a viewer tab beside your code. Viewing the same variable again (for example after stepping) updates that tab.

The variable is evaluated in the stack frame selected in the **Call Stack** view, so you can preview variables from any frame or thread.

### The viewer

  * **Rotate** with the left mouse button, **pan** with the right one, **zoom** with the wheel. **Reset view** fits the cloud again.
  * **Color** by the cloud's own **RGB** colors, by **height** along the up axis, or with a **solid** color.
  * **Up** axis: **Z** (robotics, LiDAR) or **Y** (graphics). **Axes** shows where the origin is (X red, Y green, Z blue).
  * The panel at the bottom shows the number of points and the bounding box.
  * Your toolbar choices are remembered for the next viewer you open.

You can also open any `.ply` file in the viewer: right-click its tab or the file and pick **Reopen Editor With...** > **Point Cloud Viewer**.

-----

## Demonstrations

![PLY](images/ply.gif)
![NumPy](images/numpy.gif)

-----

## Quickstart: Example Code

To test all features, you can use the following Python script. Place a breakpoint on the final `print` statement and inspect each of the defined variables.

```python
import open3d as o3d
import numpy as np
import torch

# 1. Create a basic NumPy array with XYZ points
points_np = np.random.rand(1000, 3)

# 2. Create a NumPy array with XYZ points and RGB colors
# Points are a spiral, colors transition from red to blue
z = np.linspace(0, 10, 1000)
x = np.sin(z) * 5
y = np.cos(z) * 5
points_spiral = np.vstack((x, y, z)).T
colors_gradient = np.zeros_like(points_spiral)
colors_gradient[:, 0] = np.linspace(0, 1, 1000) # Red channel
colors_gradient[:, 2] = np.linspace(1, 0, 1000) # Blue channel
points_and_colors_np = np.hstack((points_spiral, colors_gradient))

# 3. Create PyTorch Tensors from the NumPy arrays
points_torch = torch.from_numpy(points_np)
points_and_colors_torch = torch.from_numpy(points_and_colors_np)

# 4. Create a native Open3D PointCloud object
pcd_o3d = o3d.geometry.PointCloud()
pcd_o3d.points = o3d.utility.Vector3dVector(points_np)
pcd_o3d.paint_uniform_color([0.5, 0.5, 0.5]) # Gray color

# Set a breakpoint on the line below and hover over the variables to test
print("Breakpoint here: Hover over variables to preview them as PLY.")
```

-----

## Requirements

### 1\. Python Libraries

The extension only needs **NumPy** in your Python environment (`pip install numpy`). Open3D objects and PyTorch tensors are converted through NumPy, so `open3d` and `torch` are never imported by the extension. You only need them if your own code uses them.

### 2\. Supported Data Formats

  * **Open3D**: `o3d.geometry.PointCloud` and tensor-API `o3d.t.geometry.PointCloud` objects (with colors if present).
  * **NumPy** arrays and **PyTorch** tensors (any device) with shape:
      * `(n, 3)`: XYZ
      * `(n, 4)`: XYZ + intensity (e.g. LiDAR), shown with a colormap
      * `(n, 6)`: XYZ + RGB, as floats in `[0, 1]` or values in `[0, 255]`
      * Channels-first `(3|4|6, n)` and batched `(1, n, c)` layouts are handled automatically.
  * Points with `NaN`/`inf` coordinates are dropped.

-----

## Settings

| Setting | Default | Description |
|---|---|---|
| `pythonPlyPreview.maxPoints` | `1000000` | Larger clouds are randomly subsampled to this many points before export (the same points every time). `0` exports every point. |
| `pythonPlyPreview.viewer` | `builtin` | `default` opens the exported `.ply` file with your default `.ply` editor instead, for example [3D Preview](https://marketplace.visualstudio.com/items?itemName=tatsy.vscode-3d-preview). |

-----

## How it works

The Python process writes the point cloud as a binary PLY file to `.vscode/ply_preview` in your workspace; the files are removed when the debug session ends. When the Python process can't write there (attaching to a Docker container or another machine), it writes to its own temp folder and the file is sent through the debugger instead.

-----

## Release Notes

### 0.2.0

  * **Built-in 3D viewer.** Point clouds open in the extension's own viewer, so the 3D Preview extension is no longer required. It has orbit controls, point size, RGB / height / solid coloring, a Z-up or Y-up toggle, axes and grid, and shows the point count and bounding box. Viewing the same variable again updates its tab.
  * **Large clouds are subsampled** to 1,000,000 points by default (`pythonPlyPreview.maxPoints`), so the debugger and the viewer stay responsive. The viewer tells you when a cloud was subsampled.
  * **Docker and remote debugging.** If the Python process can't write to your workspace, the point cloud is sent through the debugger instead.
  * `.ply` files can be opened in the viewer with **Reopen Editor With...**.
  * To keep using 3D Preview or another `.ply` editor, set `pythonPlyPreview.viewer` to `default`.

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

### 0.0.7

  * Replaced heavy Open3D dependency with pure NumPy and Python file I/O for array saving.
  * Fixed a critical bug causing timeouts (`Cannot evaluate expression`) on macOS due to slow library loading.
  * Improved robustness across different Python versions.


### 0.0.6

  * Modified README.md to include Visual Studio Marketplace badges.
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

-----

## Acknowledgments

This project was inspired by the fantastic work of other developer tool extensions:

  * [simply-view-image-for-python-opencv-debugging](https://github.com/john-guo/simply-view-image-for-python-opencv-debugging)
  * [Python Image Preview](https://github.com/076923/python-image-preview)
  * [VSCode 3D Preview](https://github.com/tatsy/vscode-3d-preview)
