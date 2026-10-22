import numpy as np

pts = np.random.rand(1000, 3)
pts_rgb = np.hstack((pts, np.random.rand(1000, 3)))
lidar = np.random.rand(500, 4)
T4x4 = np.eye(4)
subset = pts_rgb[:10]
# ~4.5 MB as PLY: more than one chunk when fetched through the debugger
big = np.random.rand(300_000, 6)


def main():
    breakpoint()  # debugpy stops here; no editor breakpoint needed
    print(pts, pts_rgb, lidar, T4x4, subset, big)


main()
