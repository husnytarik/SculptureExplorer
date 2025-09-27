// @ts-nocheck
import { THREE, requestRender } from './scene.js';
import { flash } from './ui.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let loader, ctx = {}, currentModel = null, currentMesh = null;

export function initLoader({ scene, camera, controls, renderer, onAfterLoad }) {
    loader = new GLTFLoader();
    ctx.scene = scene; ctx.camera = camera; ctx.controls = controls; ctx.renderer = renderer; ctx.onAfterLoad = onAfterLoad;
    return { loadFromURL, loadFromFile };
}

export async function loadFromURL(url) {
    if (!url) { flash('URL boş.'); return; }
    try {
        await load(url);
    } catch (e) { flash('Model yüklenemedi.'); console.error(e); }
}

export async function loadFromFile(file) {
    try {
        const url = URL.createObjectURL(file);
        await load(url);
    } catch (e) { flash('Dosya yüklenemedi.'); console.error(e); }
}

async function load(url) {
    if (currentModel) { ctx.scene.remove(currentModel.scene || currentModel); currentModel = null; currentMesh = null; }
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || gltf.scenes?.[0];
    root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.material.side = THREE.DoubleSide; } });
    ctx.scene.add(root);
    currentModel = gltf;

    // en büyük mesh'i hedef seç
    let largest = null, area = -Infinity;
    root.traverse(n => {
        if (n.isMesh) {
            const b = new THREE.Box3().setFromObject(n);
            const s = new THREE.Vector3(); b.getSize(s);
            const a = s.x * s.y * s.z;
            if (a > area) { area = a; largest = n; }
        }
    });
    currentMesh = largest;

    fitCameraToObject(root, ctx.camera, ctx.controls, 1.25);
    requestRender();
    if (ctx.onAfterLoad) ctx.onAfterLoad({ gltf, root, mesh: currentMesh });

    const triEl = document.getElementById('triCount');
    if (triEl) triEl.textContent = countTriangles(root).toLocaleString('tr-TR');
}

export function fitCameraToObject(object, camera, controls, offset = 1.2) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const maxSize = Math.max(size.x, size.y, size.z);
    const fitDist = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
    camera.position.copy(center).add(new THREE.Vector3(fitDist * offset, fitDist * offset * 0.6, fitDist * offset));
    controls.target.copy(center); controls.update();
}

export function countTriangles(object) {
    let tri = 0;
    object.traverse(n => {
        if (n.isMesh) {
            const c = n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count;
            tri += c / 3;
        }
    });
    return tri | 0;
}

export function getCurrentMesh() { return currentMesh; }
export function getCurrentModel() { return currentModel; }
