"""Point cloud -> binary PLY exporter.

This file is executed inside the debuggee via exec() with a private globals dict
containing `__vp_obj` (the object to export), `__vp_path` (the output path) and
optionally `__vp_max_points` (subsample larger clouds to this many points; 0 = no limit).
It must only depend on NumPy; Open3D/PyTorch objects are converted through their
NumPy views so those libraries are never imported here.

If the output folder doesn't exist in the debuggee (Docker or a remote machine,
where the extension's workspace path means nothing), the file is written to the
temp folder instead and the result says where, so the extension can fetch it
through the debugger.
"""
import os
import tempfile

import numpy as np


def _to_numpy(obj):
    """Returns (points, colors) as float arrays; colors may be None."""
    module = type(obj).__module__ or ''
    name = type(obj).__name__

    if module.startswith('open3d'):
        # Tensor API: o3d.t.geometry.PointCloud
        if hasattr(obj, 'point') and not hasattr(obj, 'points'):
            points = obj.point.positions.numpy()
            try:
                colors = obj.point.colors.numpy()
            except Exception:
                colors = None
            return np.asarray(points, dtype=np.float64), colors
        # Legacy API: o3d.geometry.PointCloud
        points = np.asarray(obj.points)
        colors = np.asarray(obj.colors) if obj.has_colors() else None
        return points, colors

    if 'torch' in module and 'Tensor' in name:
        obj = obj.detach().cpu().numpy()

    arr = np.asarray(obj, dtype=np.float64)

    # Drop a leading batch dimension of size 1: (1, N, C) -> (N, C)
    while arr.ndim > 2 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim != 2:
        raise ValueError(f'ViewPLY: expected a 2D array, got shape {arr.shape}')

    # Channels-first layout: (C, N) -> (N, C)
    if arr.shape[1] not in (3, 4, 6) and arr.shape[0] in (3, 4, 6):
        arr = arr.T

    channels = arr.shape[1]
    if channels == 3:
        return arr, None
    if channels == 4:
        return arr[:, :3], _intensity_to_rgb(arr[:, 3])
    if channels == 6:
        return arr[:, :3], arr[:, 3:]
    raise ValueError(f'ViewPLY: expected shape (N, 3), (N, 4) or (N, 6), got {arr.shape}')


def _intensity_to_rgb(values):
    """Maps a scalar per point to a jet-like colormap in [0, 1]."""
    finite = np.isfinite(values)
    t = np.zeros_like(values)
    if finite.any():
        lo, hi = values[finite].min(), values[finite].max()
        t[finite] = (values[finite] - lo) / (hi - lo) if hi > lo else 0.5
    r = np.clip(1.5 - np.abs(4 * t - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * t - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * t - 1), 0, 1)
    return np.stack((r, g, b), axis=1)


def _colors_to_uint8(colors):
    colors = np.nan_to_num(np.asarray(colors, dtype=np.float64))
    if colors.size and colors.max() <= 1.0:
        colors = colors * 255.0
    return np.clip(np.rint(colors), 0, 255).astype(np.uint8)


def export(obj, path, max_points=0):
    points, colors = _to_numpy(obj)

    # Rows with NaN/inf coordinates break most viewers
    valid = np.isfinite(points).all(axis=1)
    points = points[valid]
    if colors is not None:
        colors = np.asarray(colors)[valid]

    # Fixed seed so viewing the same cloud twice shows the same subset
    total = len(points)
    if max_points and total > max_points:
        keep = np.sort(np.random.default_rng(0).choice(total, max_points, replace=False))
        points = points[keep]
        if colors is not None:
            colors = colors[keep]

    fields = [('x', '<f4'), ('y', '<f4'), ('z', '<f4')]
    if colors is not None:
        fields += [('red', 'u1'), ('green', 'u1'), ('blue', 'u1')]

    data = np.empty(len(points), dtype=fields)
    data['x'], data['y'], data['z'] = points[:, 0], points[:, 1], points[:, 2]
    if colors is not None:
        rgb = _colors_to_uint8(colors)
        data['red'], data['green'], data['blue'] = rgb[:, 0], rgb[:, 1], rgb[:, 2]

    header = ['ply', 'format binary_little_endian 1.0', f'element vertex {len(data)}']
    header += [f'property float {axis}' for axis in 'xyz']
    if colors is not None:
        header += [f'property uchar {channel}' for channel in ('red', 'green', 'blue')]
    header.append('end_header')

    written_elsewhere = not os.path.isdir(os.path.dirname(path))
    if written_elsewhere:
        folder = os.path.join(tempfile.gettempdir(), 'ply_preview')
        os.makedirs(folder, exist_ok=True)
        # Forward slashes keep the path readable in the repr the debugger returns
        path = os.path.join(folder, os.path.basename(path)).replace('\\', '/')

    with open(path, 'wb') as f:
        f.write(('\n'.join(header) + '\n').encode('ascii'))
        f.write(data.tobytes())

    notes = [f'{int((~valid).sum())} non-finite dropped']
    if len(data) < total:
        notes.append(f'subsampled from {total}')
    result = f'{len(data)} points ({", ".join(notes)})'
    if written_elsewhere:
        result += f' [written to {path}]'
    return result


if '__vp_obj' in globals():
    __vp_result = export(__vp_obj, __vp_path, globals().get('__vp_max_points', 0))
