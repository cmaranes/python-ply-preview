# VSCode Python PLY Preview 

The Python PLY Preview is a powerful extension for Visual Studio Code that enhances your debugging experience when working with point cloud data. This extension allows you to seamlessly preview and interact with PLY files and NumPy point clouds directly within the VS Code debugger.

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

## Known Issues and Limitations

There is a limitation in the number of points that can be displayed. The plugin usually works with a small number of points (<500000 points).

The temporal point clouds are installed in the __pycache__ folder.

## Release Notes

### 0.0.1

Initial release.

## Acknowledgments
- [simply-view-image-for-python-opencv-debugging](https://github.com/john-guo/simply-view-image-for-python-opencv-debugging/tree/master)
- [Python Image Preview](https://github.com/076923/python-image-preview)
- [VSCode 3D Preview](https://marketplace.visualstudio.com/items?itemName=tatsy.vscode-3d-preview)
- [vscode-pc-viewer](https://github.com/Obarads/vscode-pc-viewer)
- [WebGLPlyViewer](https://github.com/mitjap/WebGLPlyViewer)
