# The example from the README ("Try it"); also used to record the demo GIF.
# Run with F5 and right-click the variables in the Variables panel when it stops.
import numpy as np

# XYZ: a noisy plane
plane = np.c_[np.random.rand(5000, 2) * 10, np.random.randn(5000) * 0.05]

# XYZ + RGB (floats in [0, 1]): a spiral going from red to blue
t = np.linspace(0, 10, 2000)
spiral = np.c_[np.sin(t) * 5, np.cos(t) * 5, t, np.linspace(0, 1, 2000), np.zeros(2000), np.linspace(1, 0, 2000)]

# XYZ + intensity, like a LiDAR scan: a ring of points around the origin
angles = np.random.rand(20000) * 2 * np.pi
distances = 10 + np.random.randn(20000)
lidar = np.c_[np.cos(angles) * distances, np.sin(angles) * distances, np.random.randn(20000) * 0.3, distances]

# Two million points: subsampled to 1,000,000 (see pythonPlyPreview.maxPoints)
big = np.random.randn(2_000_000, 3)

# Also try a PyTorch tensor or an Open3D point cloud, if you have them installed:
# import torch; tensor = torch.from_numpy(spiral)
# import open3d as o3d; pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(plane))

breakpoint()
