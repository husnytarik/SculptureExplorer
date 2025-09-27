// /js/lighting.js
// @ts-nocheck
import { THREE, requestRender } from './scene.js';

export function initLighting({ scene, renderer, azimuth, elevation, intensity, grayscale }) {
    // Işıklar
    const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.6);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(1, 1, 1);
    sun.castShadow = true;
    scene.add(sun);

    // Slider → ışık güncelle
    function update() {
        const azr = THREE.MathUtils.degToRad(Number(azimuth && azimuth.value || 0));
        const elr = THREE.MathUtils.degToRad(Number(elevation && elevation.value || 35));
        const r = 3;
        const x = r * Math.cos(elr) * Math.cos(azr);
        const y = r * Math.sin(elr);
        const z = r * Math.cos(elr) * Math.sin(azr);
        sun.position.set(x, y, z);
        if (intensity) sun.intensity = (Number(intensity.value || 120)) / 100;
        requestRender();
    }

    if (azimuth) azimuth.addEventListener('input', update);
    if (elevation) elevation.addEventListener('input', update);
    if (intensity) intensity.addEventListener('input', update);

    if (grayscale) {
        grayscale.addEventListener('change', function () {
            renderer.domElement.style.filter = grayscale.checked ? 'grayscale(1)' : 'none';
        });
    }

    // İlk konumlandırma
    update();

    return { hemi, sun, update };
}
