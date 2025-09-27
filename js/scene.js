// @ts-nocheck
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let renderer, scene, camera, controls, viewerEl;
let needsRender = true;
let isInteracting = false;

export function initScene(el) {
    viewerEl = el;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
    renderer.setClearColor(0x000000, 1);
    viewerEl.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, viewerEl.clientWidth / viewerEl.clientHeight, 0.01, 1000);
    camera.position.set(0.8, 0.6, 1.2);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.5, 0);

    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => { isInteracting = true; requestRender(); });
    controls.addEventListener('end', () => { isInteracting = false; requestRender(); });

    renderer.domElement.addEventListener('pointerdown', () => { isInteracting = true; requestRender(); }, { passive: true });
    renderer.domElement.addEventListener('pointerup', () => { isInteracting = false; requestRender(); }, { passive: true });
    renderer.domElement.addEventListener('pointermove', () => { if (isInteracting) requestRender(); }, { passive: true });
    renderer.domElement.addEventListener('wheel', () => { isInteracting = true; requestRender(); }, { passive: true });

    const grid = new THREE.GridHelper(4, 40, 0x2a2a2a, 0x1a1a1a);
    grid.position.y = 0;
    scene.add(grid);

    window.addEventListener('resize', () => {
        renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
        camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
        camera.updateProjectionMatrix();
        requestRender();
    });

    loop();
    return { renderer, scene, camera, controls };
}

function loop() {
    requestAnimationFrame(loop);

    const changed = controls && controls.update ? controls.update() : false;
    if (changed) needsRender = true;

    if (isInteracting || needsRender) {
        renderer.render(scene, camera);
        needsRender = false;
    }
}

export function requestRender() { needsRender = true; }
export function getDomElement() { return renderer.domElement; }
export { THREE };
