# VSCode Python PLY Preview 

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/cmaranes.python-ply-preview)](https://marketplace.visualstudio.com/items?itemName=cmaranes.python-ply-preview)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/cmaranes.python-ply-preview)


The Python PLY Preview is a powerful extension for Visual Studio Code that enhances your debugging experience when working with point cloud data. This extension allows you to seamlessly preview and interact with PLY files and NumPy point clouds directly within the VS Code debugger.

**See in VS Marketplace:** [python-ply-preview](https://marketplace.visualstudio.com/items?itemName=cmaranes.python-ply-preview#review-details)

## How to use

1. Place a breakpoint at the specific line of code where you want to pause execution.

2. Initiate the program in Debug mode to start execution with breakpoints enabled.

3. Direct your cursor over the variable name and opt for View PLY from the available options.

4. The resulting point cloud will be showcased in a fresh tab for your reference.

<br>

### PLY

![PLY](images/ply.gif)

### NumPy

![NumPy](images/numpy.gif)


## Requirements

It is mandatory to import the Python open3d library to allow the extension to store the point cloud:

    import open3d as o3d

This can be installed as `pip install open3d`


In case of wanting to display a pointcloud represented as a numpy array it must be shape of (n, 3), being n the number of points. You must import numpy as:

    import numpy as np

The extension also needs a ply viewer extension, for example [this one](https://marketplace.visualstudio.com/items?itemName=tatsy.vscode-3d-preview)

## Known Issues and Limitations

There is a limitation in the number of points that can be displayed. The plugin usually works with a small number of points (<500000 points).

The temporal point clouds are installed in the __pycache__ folder.

## Release Notes

## 0.0.3

- pycache folder is created again if removed.

## 0.0.2

- Fixed extension description and name.
- Added stats in the README file.

### 0.0.1

- Initial release.

## Acknowledgments
- [simply-view-image-for-python-opencv-debugging](https://github.com/john-guo/simply-view-image-for-python-opencv-debugging/tree/master)
- [Python Image Preview](https://github.com/076923/python-image-preview)
- [VSCode 3D Preview](https://github.com/tatsy/vscode-3d-preview)
- [vscode-pc-viewer](https://github.com/Obarads/vscode-pc-viewer)
- [WebGLPlyViewer](https://github.com/mitjap/WebGLPlyViewer)
- [PLY Demo](https://sketchfab.com/3d-models/lola-b9950-ano-2000-museo-falonso-1bd88be5846340e7acd0217173fc884c)
