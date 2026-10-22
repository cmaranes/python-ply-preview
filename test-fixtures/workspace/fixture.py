import numpy as np

pts = np.random.rand(1000, 3)
pts_rgb = np.hstack((pts, np.random.rand(1000, 3)))
lidar = np.random.rand(500, 4)
T4x4 = np.eye(4)
subset = pts_rgb[:10]


def main():
    breakpoint()  # debugpy stops here; no editor breakpoint needed
    print(pts, pts_rgb, lidar, T4x4, subset)


main()
