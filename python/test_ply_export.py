"""Tests for ply_export.py. Run with: python python/test_ply_export.py"""
import json
import os
import tempfile

import numpy as np

SCRIPT = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ply_export.py'), encoding='utf8').read()


def run_export(obj):
    """Runs the script exactly like the extension does (see saveVariableAsPly)."""
    path = os.path.join(tempfile.mkdtemp(), 'out.ply').replace('\\', '/')
    command = (f"(lambda __vp_g: (exec({json.dumps(SCRIPT)}, __vp_g), __vp_g['__vp_result'])[1])"
               f"({{'__vp_obj': (obj), '__vp_path': {json.dumps(path)}}})")
    result = eval(command, {'obj': obj})
    return read_ply(path), result


def read_ply(path):
    with open(path, 'rb') as f:
        raw = f.read()
    end = raw.index(b'end_header\n') + len(b'end_header\n')
    header = raw[:end].decode('ascii').splitlines()
    assert header[1] == 'format binary_little_endian 1.0'
    count = int(header[2].split()[-1])
    has_color = any('red' in line for line in header)
    fields = [('x', '<f4'), ('y', '<f4'), ('z', '<f4')]
    if has_color:
        fields += [('red', 'u1'), ('green', 'u1'), ('blue', 'u1')]
    return np.frombuffer(raw[end:], dtype=fields, count=count)


def test_xyz():
    pts = np.random.rand(100, 3)
    data, result = run_export(pts)
    assert len(data) == 100 and data.dtype.names == ('x', 'y', 'z')
    assert np.allclose(data['x'], pts[:, 0], atol=1e-6)
    assert result.startswith('100 points')


def test_xyzrgb_float_and_uint8():
    pts = np.hstack((np.random.rand(10, 3), np.ones((10, 3))))
    data, _ = run_export(pts)
    assert (data['red'] == 255).all()
    pts[:, 3:] = 128
    data, _ = run_export(pts)
    assert (data['green'] == 128).all()


def test_intensity_colormap():
    pts = np.hstack((np.random.rand(50, 3), np.linspace(0, 100, 50)[:, None]))
    data, _ = run_export(pts)
    assert 'red' in data.dtype.names
    assert data['blue'][0] > data['red'][0] and data['red'][-1] > data['blue'][-1]


def test_channels_first_and_batch():
    pts = np.random.rand(3, 20)
    data, _ = run_export(pts)
    assert len(data) == 20
    data, _ = run_export(np.random.rand(1, 30, 6))
    assert len(data) == 30


def test_non_finite_dropped():
    pts = np.random.rand(10, 3)
    pts[2, 1] = np.nan
    pts[5, 0] = np.inf
    data, result = run_export(pts)
    assert len(data) == 8 and '2 non-finite' in result


def test_bad_shape_raises():
    try:
        run_export(np.random.rand(10, 5))
    except ValueError as e:
        assert str(e).startswith('ViewPLY:')
    else:
        raise AssertionError('expected ValueError')


def test_no_globals_leak():
    namespace = {'obj': np.random.rand(5, 3)}
    before = set(namespace)
    path = os.path.join(tempfile.mkdtemp(), 'out.ply').replace('\\', '/')
    eval(f"(lambda __vp_g: (exec({json.dumps(SCRIPT)}, __vp_g), __vp_g['__vp_result'])[1])"
         f"({{'__vp_obj': (obj), '__vp_path': {json.dumps(path)}}})", namespace)
    assert set(namespace) - before <= {'__builtins__'}


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for test in tests:
        test()
        print(f'ok  {test.__name__}')
    try:
        import torch
        data, _ = run_export(torch.rand(1, 40, 3))
        assert len(data) == 40
        print('ok  torch')
    except ImportError:
        print('skip torch (not installed)')
    try:
        import open3d as o3d
        pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(np.random.rand(25, 3)))
        pcd.paint_uniform_color([0.5, 0.5, 0.5])
        data, _ = run_export(pcd)
        assert len(data) == 25 and (data['red'] == 128).all()
        print('ok  open3d')
    except ImportError:
        print('skip open3d (not installed)')
