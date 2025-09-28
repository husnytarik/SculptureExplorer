// /js/filters.js
// @ts-nocheck
import { THREE, requestRender, setRenderOverride } from './scene.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SobelOperatorShader } from 'three/examples/jsm/shaders/SobelOperatorShader.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { CurvatureShader } from './curvature.js';

export function initFilters({ renderer, scene, camera }) {
    // --- Post chain ---
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // --- Normal buffer (NormalPass yerine) ---
    const normalTarget = new THREE.WebGLRenderTarget(2, 2, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
    });
    const normalMaterial = new THREE.MeshNormalMaterial({ toneMapped: false });

    // --- SSAO ---
    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.10;
    ssaoPass.enabled = false;
    composer.addPass(ssaoPass);

    // --- Curvature/Cavity (normalTarget'ı kullanır) ---
    const curvaturePass = new ShaderPass(CurvatureShader);
    curvaturePass.enabled = false;
    curvaturePass.material.uniforms.tNormal.value = normalTarget.texture;
    composer.addPass(curvaturePass);

    // --- FXAA (sadece efektler açıkken) ---
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.enabled = false;
    composer.addPass(fxaaPass);

    // --- Kenar (Sobel) ---
    const sobelPass = new ShaderPass(SobelOperatorShader);
    sobelPass.enabled = false;
    composer.addPass(sobelPass);

    // Boyut / DPI
    function resize() {
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        const w = renderer.domElement.clientWidth || window.innerWidth;
        const h = renderer.domElement.clientHeight || window.innerHeight;

        composer.setPixelRatio(dpr);
        composer.setSize(w, h);

        // FXAA: 1/(w*dpr), 1/(h*dpr)
        fxaaPass.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
        // SSAO: piksel boyutları
        ssaoPass.setSize(w, h);
        // Sobel ve Curvature: çözünürlük (piksel cinsinden)
        sobelPass.material.uniforms.resolution.value.set(w * dpr, h * dpr);
        curvaturePass.material.uniforms.resolution.value.set(w * dpr, h * dpr);

        // Normal buffer da aynı DPR ile render edilecek
        normalTarget.setSize(w * dpr, h * dpr);

        requestRender();
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 0);

    // Composer’ı ne zaman devreye alacağımız
    let anyEnabled = false;
    function updateOverride() {
        const active = !!(ssaoPass.enabled || sobelPass.enabled || curvaturePass.enabled);
        fxaaPass.enabled = active;
        if (active !== anyEnabled) {
            anyEnabled = active;
            // Efekt aktifken: önce normal buffer'ı güncelle, sonra composer.render()
            if (active) {
                setRenderOverride(() => {
                    const old = scene.overrideMaterial;
                    scene.overrideMaterial = normalMaterial;
                    renderer.setRenderTarget(normalTarget);
                    renderer.render(scene, camera);
                    renderer.setRenderTarget(null);
                    scene.overrideMaterial = old;

                    composer.render();
                });
            } else {
                setRenderOverride(null);
            }
        }
        requestRender();
    }

    // Dış API
    function enableSSAO(on) { ssaoPass.enabled = !!on; updateOverride(); }
    function enableEdges(on) { sobelPass.enabled = !!on; updateOverride(); }
    function enableCurvature(on) { curvaturePass.enabled = !!on; updateOverride(); }
    function setCurvatureStrength(v) {
        const k = Math.max(0, Math.min(2, Number(v) || 0));
        curvaturePass.material.uniforms.strength.value = k;
        curvaturePass.enabled = k > 0.001;   // ~0 iken tamamen kapat
        requestRender();
    }
    function setQuality(q) {
        if (q === 'low') { ssaoPass.kernelRadius = 8; ssaoPass.minDistance = 0.01; ssaoPass.maxDistance = 0.08; }
        else { ssaoPass.kernelRadius = 16; ssaoPass.minDistance = 0.005; ssaoPass.maxDistance = 0.10; }
        requestRender();
    }
    function reset() {
        ssaoPass.enabled = false;
        sobelPass.enabled = false;
        curvaturePass.enabled = false;
        updateOverride();
    }

    return { enableSSAO, enableEdges, enableCurvature, setCurvatureStrength, setQuality, reset, resize };
}
