// Point cloud viewer running inside the webview. Bundled with three.js by esbuild.mjs into media/viewer.js.
// The markup (canvas container, toolbar, info panel) comes from ViewerPanels.getHtml.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColorMode, DEFAULT_VIEWER_SETTINGS, FromViewerMessage, ToViewerMessage, UpAxis, ViewerSettings } from '../viewerProtocol';

declare function acquireVsCodeApi(): { postMessage(message: FromViewerMessage): void };

const vscode = acquireVsCodeApi();

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const container = element<HTMLDivElement>('viewport');
const message = element<HTMLDivElement>('message');
const info = element<HTMLDivElement>('info');
const pointSizeInput = element<HTMLInputElement>('point-size');
const colorModeSelect = element<HTMLSelectElement>('color-mode');
const upAxisSelect = element<HTMLSelectElement>('up-axis');
const axesCheckbox = element<HTMLInputElement>('show-axes');
const gridCheckbox = element<HTMLInputElement>('show-grid');
const resetButton = element<HTMLButtonElement>('reset-view');

let settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };

// --- Scene ---

/** Holds everything in data coordinates; rotated so the data's up axis points up on screen. */
const dataGroup = new THREE.Group();
const scene = new THREE.Scene();
scene.add(dataGroup);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
const material = new THREE.PointsMaterial({ size: settings.pointSize, sizeAttenuation: false });

let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let points: THREE.Points | undefined;
let axes: THREE.AxesHelper | undefined;
let grid: THREE.GridHelper | undefined;
/** Per-point colors from the file, normalized to [0, 1] by PLYLoader */
let fileColors: THREE.BufferAttribute | undefined;

try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.addEventListener('change', render);
    new ResizeObserver(resize).observe(container);
} catch (error) {
    // Parsing and the 'loaded' message still work without WebGL
    renderer = undefined;
    showMessage(`Could not start WebGL, so the point cloud can't be displayed. ${String(error)}`);
    vscode.postMessage({ type: 'error', message: `WebGL unavailable: ${String(error)}` });
}

function render() {
    renderer?.render(scene, camera);
}

function resize() {
    if (!renderer) {
        return;
    }
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
    render();
}

function showMessage(text: string) {
    message.textContent = text;
    message.hidden = !text;
}

// --- Loading ---

function loadCloud(name: string, bytes: Uint8Array, totalPoints?: number) {
    let geometry: THREE.BufferGeometry;
    try {
        // Copy out the exact bytes: the Uint8Array may be a view into a larger buffer
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        geometry = new PLYLoader().parse(buffer);
    } catch (error) {
        showMessage(`Could not read '${name}' as a PLY file. ${String(error)}`);
        vscode.postMessage({ type: 'error', message: `PLY parse failed for '${name}': ${String(error)}` });
        return;
    }
    // Meshes are shown as their vertices
    geometry.setIndex(null);

    fileColors = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    const count = geometry.getAttribute('position')?.count ?? 0;
    vscode.postMessage({ type: 'loaded', name, points: count, totalPoints, hasColors: !!fileColors });

    if (points) {
        dataGroup.remove(points);
        points.geometry.dispose();
    }
    geometry.computeBoundingBox();
    points = new THREE.Points(geometry, material);
    dataGroup.add(points);

    updateInfo(count, totalPoints, geometry.boundingBox!);
    applySettings(true);
    if (renderer) {
        showMessage(count ? '' : 'The point cloud is empty.');
    }
}

function updateInfo(count: number, totalPoints: number | undefined, box: THREE.Box3) {
    const format = (v: THREE.Vector3) => `${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}`;
    const lines = [`${count.toLocaleString()} points`];
    if (totalPoints && totalPoints > count) {
        lines.push(`subsampled from ${totalPoints.toLocaleString()} (pythonPlyPreview.maxPoints)`);
    }
    if (count) {
        lines.push(`min  ${format(box.min)}`, `max  ${format(box.max)}`, `size ${format(box.getSize(new THREE.Vector3()))}`);
    }
    info.textContent = lines.join('\n');
}

function fmt(value: number) {
    return Number(value.toPrecision(4)).toString();
}

// --- Settings ---

/** Applies `settings` to the scene; `frame` re-centers the camera on the cloud. */
function applySettings(frame = false) {
    material.size = settings.pointSize;

    // Three.js is Y-up; rotate Z-up data so +Z points up on screen
    dataGroup.rotation.x = settings.upAxis === 'z' ? -Math.PI / 2 : 0;
    dataGroup.updateMatrixWorld(true);

    applyColors();

    const colorRgb = colorModeSelect.querySelector<HTMLOptionElement>('option[value="rgb"]')!;
    colorRgb.disabled = !fileColors;

    updateHelpers();
    if (frame) {
        frameCloud();
    }
    syncControls();
    render();
}

function effectiveColorMode(): ColorMode {
    return settings.colorMode === 'rgb' && !fileColors ? 'height' : settings.colorMode;
}

function applyColors() {
    if (!points) {
        return;
    }
    const geometry = points.geometry;
    const mode = effectiveColorMode();

    if (mode === 'solid') {
        material.vertexColors = false;
        material.color.set(themeColor('--vscode-charts-blue', '#3794ff'));
    } else {
        material.vertexColors = true;
        material.color.set(0xffffff);
        geometry.setAttribute('color', mode === 'rgb' ? fileColors! : heightColors(geometry, settings.upAxis));
    }
    material.needsUpdate = true;
}

/** Colors each point by its coordinate along the up axis, using a viridis-like ramp. */
function heightColors(geometry: THREE.BufferGeometry, upAxis: UpAxis): THREE.BufferAttribute {
    const position = geometry.getAttribute('position');
    const axis = upAxis === 'z' ? 2 : 1;
    const box = geometry.boundingBox!;
    const lo = box.min.getComponent(axis);
    const range = box.max.getComponent(axis) - lo || 1;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
        viridis((position.getComponent(i, axis) - lo) / range, color);
        colors[3 * i] = color.r;
        colors[3 * i + 1] = color.g;
        colors[3 * i + 2] = color.b;
    }
    return new THREE.BufferAttribute(colors, 3);
}

const VIRIDIS = [0x440154, 0x3b528b, 0x21918c, 0x5ec962, 0xfde725].map(hex => new THREE.Color(hex));

function viridis(t: number, target: THREE.Color) {
    const scaled = Math.min(Math.max(t, 0), 1) * (VIRIDIS.length - 1);
    const i = Math.min(Math.floor(scaled), VIRIDIS.length - 2);
    return target.copy(VIRIDIS[i]).lerp(VIRIDIS[i + 1], scaled - i);
}

function themeColor(variable: string, fallback: string) {
    return getComputedStyle(document.body).getPropertyValue(variable).trim() || fallback;
}

/** World-space bounding box of the cloud (after the up-axis rotation). */
function worldBox() {
    return points ? new THREE.Box3().setFromObject(points) : new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
}

function updateHelpers() {
    const box = worldBox();
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-6);

    if (axes) {
        dataGroup.remove(axes);
        axes.dispose();
    }
    // At the data origin, so it shows where (0, 0, 0) is: X red, Y green, Z blue
    axes = new THREE.AxesHelper(radius * 0.25);
    axes.visible = settings.showAxes;
    dataGroup.add(axes);

    if (grid) {
        scene.remove(grid);
        grid.dispose();
    }
    // On the ground below the cloud, with a round cell size
    const extent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-6);
    const cell = Math.pow(10, Math.floor(Math.log10(extent / 2)));
    const divisions = Math.ceil(extent / cell) + 2;
    grid = new THREE.GridHelper(divisions * cell, divisions, 0x888888, 0x888888);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    const center = box.getCenter(new THREE.Vector3());
    grid.position.set(Math.round(center.x / cell) * cell, box.min.y, Math.round(center.z / cell) * cell);
    grid.visible = settings.showGrid;
    scene.add(grid);
}

function frameCloud() {
    const sphere = worldBox().getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1e-6);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.near = radius / 1000;
    camera.far = radius * 100;
    camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(distance));
    camera.updateProjectionMatrix();
    if (controls) {
        controls.target.copy(sphere.center);
        controls.update();
    }
}

/** Updates the toolbar to match `settings`. */
function syncControls() {
    pointSizeInput.value = String(settings.pointSize);
    colorModeSelect.value = effectiveColorMode();
    upAxisSelect.value = settings.upAxis;
    axesCheckbox.checked = settings.showAxes;
    gridCheckbox.checked = settings.showGrid;
}

function changeSettings(change: Partial<ViewerSettings>, frame = false) {
    settings = { ...settings, ...change };
    applySettings(frame);
    vscode.postMessage({ type: 'settingsChanged', settings });
}

pointSizeInput.addEventListener('input', () => changeSettings({ pointSize: Number(pointSizeInput.value) }));
colorModeSelect.addEventListener('change', () => changeSettings({ colorMode: colorModeSelect.value as ColorMode }));
upAxisSelect.addEventListener('change', () => changeSettings({ upAxis: upAxisSelect.value as UpAxis }, true));
axesCheckbox.addEventListener('change', () => changeSettings({ showAxes: axesCheckbox.checked }));
gridCheckbox.addEventListener('change', () => changeSettings({ showGrid: gridCheckbox.checked }));
resetButton.addEventListener('click', () => {
    frameCloud();
    render();
});

// --- Messages ---

window.addEventListener('message', (event: MessageEvent<ToViewerMessage>) => {
    const data = event.data;
    if (data.type === 'settings') {
        settings = { ...DEFAULT_VIEWER_SETTINGS, ...data.settings };
        applySettings();
    } else if (data.type === 'cloud') {
        loadCloud(data.name, data.bytes, data.totalPoints);
    }
});

syncControls();
vscode.postMessage({ type: 'ready' });
