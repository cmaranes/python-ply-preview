# VSCode Python PLY Preview

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/cmaranes.python-ply-preview)](https://marketplace.visualstudio.com/items?itemName=cmaranes.python-ply-preview)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/cmaranes.python-ply-preview)

🚀 Instantly visualize 3D point clouds from your Python debugger in VS Code\!

This extension enhances your debugging workflow by allowing you to preview point cloud variables as `.ply` files directly from the editor. It supports native **Open3D** point clouds, **NumPy** arrays, and **PyTorch** tensors.

**See it on the VS Marketplace:** [Python PLY Preview](https://marketplace.visualstudio.com/items?itemName=cmaranes.python-ply-preview)

-----

## How to Use

1.  Set a breakpoint in your Python code.
2.  Start your program in **Debug Mode** (F5).
3.  When execution pauses, hover your cursor over a point cloud variable.
4.  In the hover menu, select **View PLY**.
5.  The point cloud will be rendered in a new editor tab.

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

The extension leverages **Open3D** to save the point cloud data. It handles imports automatically, so you don't need to import `open3d` in your script.

However, the libraries must be installed in your Python environment:
- **open3d**: Mandatory for all operations.
- **numpy**: Required for NumPy visualization.
- **torch**: Required for PyTorch visualization.

You can install these packages using pip:
`pip install open3d numpy torch`

### 2\. Supported Data Formats

  * **Open3D**: Native `o3d.geometry.PointCloud` objects.
  * **NumPy**: `np.ndarray` with shape `(n, 3)` for XYZ points or `(n, 6)` for XYZ + RGB points.
  * **PyTorch**: `torch.Tensor` with shape `(n, 3)` for XYZ points or `(n, 6)` for XYZ + RGB points.

### 3\. PLY Viewer Extension

This extension handles the *saving* of the point cloud. You need another extension to *view* the resulting `.ply` file. We recommend:

  * [**3D Preview** by tatsy](https://marketplace.visualstudio.com/items?itemName=tatsy.vscode-3d-preview)

-----

## Known Issues

  * Performance may degrade with a very large number of points (tested up to \~500,000 points).

-----

## Release Notes

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
