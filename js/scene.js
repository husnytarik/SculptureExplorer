// /js/scene.js
// @ts-nocheck
import * as THREE_NS from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const THREE = THREE_NS;

let renderer, scene, camera, controls, root;
let needsRender = true;
let externalRender = null;

// Dışarıdan erişilsin
export let grid = null;

// Kamera yardımcıları
export function getCamera() { return camera; }
export function getDomElement() { return renderer?.domElement; }
export function requestRender() { needsRender = true; }

// Post-process için render override (composer devredeyken)
export function setRenderOverride(fn) {
    externalRender = typeof fn === 'function' ? fn : null;
    requestRender();
}

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

    grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    grid.name = 'ground_grid';
    scene.add(grid);

    window.addEventListener('resize', onResize);
    loop();

    return { renderer, scene, camera, controls };
}

function onResize() {
    if (!renderer || !camera || !root) return;
    renderer.setSize(root.clientWidth, root.clientHeight);

    if (camera.isPerspectiveCamera) {
        camera.aspect = root.clientWidth / root.clientHeight;
    } else if (camera.isOrthographicCamera) {
        const aspect = root.clientWidth / root.clientHeight;
        const frustumSize = 2; // ihtiyaca göre ayarla
        camera.left = -frustumSize * aspect;
        camera.right = frustumSize * aspect;
        camera.top = frustumSize;
        camera.bottom = -frustumSize;
    }
    camera.updateProjectionMatrix();
    requestRender();
}

function loop() {
    // Damping için şart
    if (controls) controls.update();

    if (needsRender) {
        if (externalRender) externalRender(); // composer render’ı
        else renderer.render(scene, camera);
        needsRender = false;
    }
    requestAnimationFrame(loop);
}

// --------- Kamera API’si ---------
export function setFov(fov) {
    if (camera && camera.isPerspectiveCamera) {
        camera.fov = Math.max(20, Math.min(120, Number(fov) || 45));
        camera.updateProjectionMatrix();
        requestRender();
    }
}

export function switchToPerspective() {
    if (!root || !camera) return;
    const aspect = root.clientWidth / root.clientHeight;
    const pos = camera.position.clone();
    const target = controls?.target?.clone?.() || new THREE.Vector3(0, 0, 0);

    const newCam = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
    newCam.position.copy(pos);

    camera = newCam;
    if (controls) {
        controls.object = camera;
        controls.target.copy(target);
        controls.update();
    }
    requestRender();
}

export function switchToOrthographic() {
    if (!root || !camera) return;
    const aspect = root.clientWidth / root.clientHeight;
    const frustumSize = 2; // sahne boyuna göre ayarla
    const pos = camera.position.clone();
    const target = controls?.target?.clone?.() || new THREE.Vector3(0, 0, 0);

    const newCam = new THREE.OrthographicCamera(
        -frustumSize * aspect,
        frustumSize * aspect,
        frustumSize,
        -frustumSize,
        0.01,
        1000
    );
    newCam.position.copy(pos);

    camera = newCam;
    if (controls) {
        controls.object = camera;
        controls.target.copy(target);
        controls.update();
    }
    requestRender();
}
