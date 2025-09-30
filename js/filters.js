// /js/filters.js
// @ts-nocheck
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SobelOperatorShader } from 'three/examples/jsm/shaders/SobelOperatorShader.js';

// Ekran normal'ı için
import { NormalPass } from './postprocessing/NormalPass.js';
// Curvature shader
import { CurvatureShader } from './curvature.js';

/**
 * Sade post-process yöneticisi:
 *  - Kenar Vurgusu (Sobel)
 *  - Curvature (Cavity)
 *
 * KALDIRILDI: SSAO, FXAA, Raking/RTI ve tüm preset/quality ayarları
 */
export function initFilters({ renderer, scene, camera, setRenderOverride }) {
    let cam = camera;

    // Composer + temel render pass
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, cam);
    composer.addPass(renderPass);

    // Pass referansları
    let sobelPass = null;        // Kenar vurgusu
    let normalPass = null;       // Curvature için normal buffer
    let curvaturePass = null;    // Curvature shader

    const enabled = { edges: false, curvature: false };

    function useComposerIfNeeded() {
        const anyOn = enabled.edges || enabled.curvature;
        if (setRenderOverride) {
            setRenderOverride(anyOn ? () => composer.render() : null);
        }
    }

    function setCamera(newCam) {
        cam = newCam;
        renderPass.camera = cam;
        if (normalPass) normalPass.camera = cam;
        composer.render();
    }

    function resize() {
        const size = renderer.getSize(new THREE.Vector2()); // { x, y }
        composer.setSize(size.x, size.y);

        if (sobelPass) {
            // Sobel, çözünürlüğü piksel cinsinden ister
            sobelPass.uniforms.resolution.value.set(size.x, size.y);
        }
        if (curvaturePass) {
            curvaturePass.uniforms.resolution.value.set(size.x, size.y);
        }
        if (normalPass && normalPass.setSize) {
            normalPass.setSize(size.x, size.y);
        }
    }

    // ---- Kenar Vurgusu (Sobel) ----
    function enableEdges(on) {
        const size = renderer.getSize(new THREE.Vector2());
        if (on && !sobelPass) {
            sobelPass = new ShaderPass(SobelOperatorShader);
            sobelPass.uniforms.resolution.value.set(size.x, size.y);
            composer.addPass(sobelPass);
        }
        if (!on && sobelPass) {
            composer.removePass(sobelPass);
            sobelPass = null;
        }
        enabled.edges = !!on;
        useComposerIfNeeded();
        composer.render();
    }

    // ---- Curvature (Cavity) ----
    function enableCurvature(on) {
        const size = renderer.getSize(new THREE.Vector2());

        if (on && !normalPass) {
            // ekran normal'ı üret (curvature için gerekli)
            normalPass = new NormalPass(scene, cam);
            composer.addPass(normalPass);
        }
        if (on && !curvaturePass) {
            curvaturePass = new ShaderPass(CurvatureShader);
            curvaturePass.uniforms.resolution.value.set(size.x, size.y);
            curvaturePass.uniforms.tNormal.value = normalPass?.renderTarget?.texture || null;
            // strength/bias varsayılanları curvature.js içinde
            composer.addPass(curvaturePass);
        }

        if (!on) {
            if (curvaturePass) { composer.removePass(curvaturePass); curvaturePass = null; }
            if (normalPass) { composer.removePass(normalPass); normalPass = null; }
        }

        enabled.curvature = !!on;
        useComposerIfNeeded();
        composer.render();
    }

    function setCurvatureStrength(val) {
        if (!curvaturePass) return;
        // main.js bize 0.01–200 aralığını /100 ölçeği ile yolluyor; burada 0–2 aralığına klamplayalım
        const k = Math.max(0, Math.min(2, Number(val) || 0));
        curvaturePass.uniforms.strength.value = k;
        composer.render();
    }

    // Kalite/preset artık yok; yine de API kırılmasın diye no-op bırakıyoruz
    function setQuality(_) { composer.render(); }

    function reset() {
        enableEdges(false);
        enableCurvature(false);
        composer.render();
    }

    // başlangıç
    useComposerIfNeeded();

    return {
        // yalnızca gerekli API
        enableEdges,
        enableCurvature,
        setCurvatureStrength,
        setQuality,     // no-op
        reset,
        setCamera,
        resize
    };
}
