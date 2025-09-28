// /js/scene.js
// @ts-nocheck
import * as THREE_NS from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const THREE = THREE_NS;

let renderer, scene, camera, controls, root;
let needsRender = true;
let externalRender = null;

// 👇 grid’i modül seviyesinde export et
export let grid = null;
// (İstersen getter da verebiliriz)
// export function getGrid() { return grid; }

export function initScene(container) {
    root = container;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(root.clientWidth, root.clientHeight);
    renderer.setClearColor(0x000000, 1);
    root.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, root.clientWidth / root.clientHeight, 0.01, 1000);
    camera.position.set(0.8, 0.6, 1.2);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.5, 0);
    controls.addEventListener('change', () => requestRender());

    // 👇 burada değeri ata (artık export let grid dışarıdan erişilebilir)
    grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    grid.name = 'ground_grid';
    scene.add(grid);

    window.addEventListener('resize', onResize);
    loop();

    return { renderer, scene, camera, controls };
}

export function requestRender() { needsRender = true; }
export function getDomElement() { return renderer.domElement; }

// Post-process için dış render fonksiyonu
export function setRenderOverride(fn) {
    externalRender = typeof fn === 'function' ? fn : null;
}

function onResize() {
    if (!renderer || !camera || !root) return;
    renderer.setSize(root.clientWidth, root.clientHeight);
    camera.aspect = root.clientWidth / root.clientHeight;
    camera.updateProjectionMatrix();
    requestRender();
}

function loop() {
    if (needsRender) {
        if (externalRender) externalRender();
        else renderer.render(scene, camera);
        needsRender = false;
    }
    requestAnimationFrame(loop);
}

export function setFov(fov) {
    if (camera && camera.isPerspectiveCamera) {
        camera.fov = Math.max(20, Math.min(120, fov));
        camera.updateProjectionMatrix();
        requestRender();
    }
}

export function switchToPerspective() {
    if (!root) return;
    const aspect = root.clientWidth / root.clientHeight;
    const pos = camera.position.clone(); // mevcut konumu koru
    camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
    camera.position.copy(pos);
    controls.object = camera;
    controls.update();
    requestRender();
}

export function switchToOrthographic() {
    if (!root) return;
    const aspect = root.clientWidth / root.clientHeight;
    const frustumSize = 2; // sahne boyuna göre ayarla
    const pos = camera.position.clone();
    camera = new THREE.OrthographicCamera(
        -frustumSize * aspect,
        frustumSize * aspect,
        frustumSize,
        -frustumSize,
        0.01,
        1000
    );
    camera.position.copy(pos);
    controls.object = camera;
    controls.update();
    requestRender();
}
