"""Manual check: previewing variables from a non-top stack frame.

Put a breakpoint on the marked line. While paused in `inner`, `outer_pts` is not
visible; select the `outer` frame in the Call Stack view and it should preview.
"""
import numpy as np


def inner():
    inner_pts = np.random.rand(100, 3)
    print(inner_pts.shape)  # BREAKPOINT


def outer():
    outer_pts = np.random.rand(300, 3) * 5
    inner()
    print(outer_pts.shape)


outer()
