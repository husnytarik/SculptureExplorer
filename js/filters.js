// /js/filters.js
// @ts-nocheck
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SobelOperatorShader } from 'three/examples/jsm/shaders/SobelOperatorShader.js';
import { NormalPass } from './postprocessing/NormalPass.js';
import { RakingLightShader } from './rtiRaking.js';

// Curvature shader’ını ayrı modülden çek
import { CurvatureShader } from './curvature.js';

export function initFilters({ renderer, scene, camera, setRenderOverride }) {
    let cam = camera;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, cam);
    composer.addPass(renderPass);

    // Pas referansları
    let ssaoPass = null;
    let sobelPass = null;      // Kenar vurgusu
    let fxaaPass = null;      // Anti-aliasing (opsiyonel)
    let normalPass = null;     // Curvature için ekran normal’ı
    let curvaturePass = null;  // Curvature shader pass
    let rakingPass = null;

    const enabled = { ssao: false, edges: false, curvature: false, raking: false };

    function useComposerIfNeeded() {
        const anyOn = enabled.ssao || enabled.edges || enabled.curvature;
        if (setRenderOverride) setRenderOverride(anyOn ? () => composer.render() : null);
    }

    function setCamera(newCam) {
        cam = newCam;
        renderPass.camera = cam;
        if (ssaoPass) ssaoPass.camera = cam;
        if (normalPass) normalPass.camera = cam;
        composer.render();
    }

    function resize() {
        const size = renderer.getSize(new THREE.Vector2()); // { x, y }
        composer.setSize(size.x, size.y);

        if (fxaaPass) {
            const pr = renderer.getPixelRatio();
            fxaaPass.material.uniforms.resolution.value.set(1 / (size.x * pr), 1 / (size.y * pr));
        }
        if (sobelPass) {
            sobelPass.uniforms.resolution.value.set(size.x, size.y);
        }
        if (ssaoPass && ssaoPass.setSize) ssaoPass.setSize(size.x, size.y);

        if (curvaturePass) curvaturePass.uniforms.resolution.value.set(size.x, size.y);
        if (normalPass && normalPass.setSize) normalPass.setSize(size.x, size.y);
        if (rakingPass) rakingPass.uniforms.resolution.value.copy(renderer.getSize(new THREE.Vector2()));

    }

    // --- Efektler ---
    // --- Raking (RTI-benzeri) ---
    function enableRaking(on) {
        const size = renderer.getSize(new THREE.Vector2());
        if (on && !normalPass) { // normalPass yoksa kur
            normalPass = new NormalPass(scene, cam);
            composer.addPass(normalPass);
        }
        if (on && !rakingPass) {
            rakingPass = new ShaderPass(RakingLightShader);
            rakingPass.uniforms.resolution.value.set(size.x, size.y);
            rakingPass.uniforms.tNormal.value = normalPass?.renderTarget?.texture || null;
            composer.addPass(rakingPass);
        }
        if (!on) {
            if (rakingPass) { composer.removePass(rakingPass); rakingPass = null; }
            // normalPass curvature veya başka bir pass kullanıyorsa kalsın; istemezsen burada kaldırabilirsin
        }
        enabled.raking = !!on;
        useComposerIfNeeded();
        composer.render();
    }

    function setRakingLightDirFromAzEl(azDeg, elDeg) {
        if (!rakingPass) return;
        // derece -> radyan
        const az = azDeg * Math.PI / 180;
        const el = elDeg * Math.PI / 180;
        // küreselden kartesyene (X sağ, Y yukarı, Z izleyiciye)
        const x = Math.cos(el) * Math.cos(az);
        const y = Math.sin(el);
        const z = Math.cos(el) * Math.sin(az);
        rakingPass.uniforms.lightDir.value.set(x, y, z).normalize();
        composer.render();
    }


    function setRakingParams({ gain, wrap, specPow, specStr, rimStr, rimPow }) {
        if (!rakingPass) return;
        if (Number.isFinite(gain)) rakingPass.uniforms.gain.value = gain;
        if (Number.isFinite(wrap)) rakingPass.uniforms.wrap.value = Math.max(0, Math.min(0.8, wrap));
        if (Number.isFinite(specPow)) rakingPass.uniforms.specPow.value = Math.max(1, specPow);
        if (Number.isFinite(specStr)) rakingPass.uniforms.specStr.value = Math.max(0, specStr);
        if (Number.isFinite(rimStr)) rakingPass.uniforms.rimStr.value = Math.max(0, rimStr);
        if (Number.isFinite(rimPow)) rakingPass.uniforms.rimPow.value = Math.max(0.1, rimPow);
        composer.render();
    }

    function enableSSAO(on) {
        if (on && cam && cam.isOrthographicCamera) { console.warn('[filters] SSAO ortho’da devre dışı.'); on = false; }

        if (on && !ssaoPass) {
            const size = renderer.getSize(new THREE.Vector2());
            ssaoPass = new SSAOPass(scene, cam, size.x, size.y);
            // daha görünür varsayılanlar (sahnene göre oynat)
            ssaoPass.kernelRadius = 16;
            ssaoPass.minDistance = 0.002;
            ssaoPass.maxDistance = 0.2;
            composer.addPass(ssaoPass);

            // Hafif AA (opsiyonel)
            if (!fxaaPass) {
                fxaaPass = new ShaderPass(FXAAShader);
                const pr = renderer.getPixelRatio();
                fxaaPass.material.uniforms.resolution.value.set(1 / (size.x * pr), 1 / (size.y * pr));
                composer.addPass(fxaaPass);
            }
        }
        if (!on && ssaoPass) {
            composer.removePass(ssaoPass);
            ssaoPass = null;
        }
        enabled.ssao = !!on;
        useComposerIfNeeded();
        composer.render();
    }

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

    function enableCurvature(on) {
        const size = renderer.getSize(new THREE.Vector2());

        if (on && !normalPass) {
            // normal buffer üret
            normalPass = new NormalPass(scene, cam);
            composer.addPass(normalPass);
        }
        if (on && !curvaturePass) {
            curvaturePass = new ShaderPass(CurvatureShader);
            curvaturePass.uniforms.resolution.value.set(size.x, size.y);
            curvaturePass.uniforms.tNormal.value = normalPass?.renderTarget?.texture || null;
            // strength/bias defaults curvature.js içinden geliyor
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

    function setCurvatureStrength(v) {
        if (curvaturePass) {
            const k = Math.max(0, Math.min(2, Number(v) || 0));
            curvaturePass.uniforms.strength.value = k;
            composer.render();
        }
    }

    function setQuality(q) {
        // Kalite ayarların varsa (kernelRadius/blur gibi) burada yönet
        composer.render();
    }

    function reset() {
        enableSSAO(false);
        enableEdges(false);
        enableCurvature(false);
        composer.render();
    }

    // başlangıç
    useComposerIfNeeded();

    return {
        enableSSAO, enableEdges, enableCurvature,
        setCurvatureStrength, setQuality, reset,
        setCamera, resize,
        enableRaking, setRakingLightDirFromAzEl, setRakingParams
    };
}
