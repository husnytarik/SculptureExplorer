// /js/main.js
// @ts-nocheck
import {
    initScene, getDomElement, THREE, grid, requestRender,
    setFov, switchToPerspective, switchToOrthographic, getCamera,
    setRenderOverride
} from './scene.js';

import { initLighting } from './lighting.js';
import { initLoader } from './loader.js';
import { initMeasurements } from './measurements.js';
import { initMetadata } from './metadata.js';
import { initCatalog } from './catalog.js';
import { flash, fmtLen } from './ui.js';
import { initFilters } from './filters.js';

function must(id) {
    const el = document.getElementById(id);
    if (!el) { const msg = '[main] DOM id bulunamadı: #' + id; console.error(msg); flash(msg); }
    return el;
}

function countTriangles(object) {
    let tri = 0;
    object.traverse(n => {
        if (n.isMesh && n.geometry) {
            const g = n.geometry;
            const cnt = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
            tri += (cnt / 3) | 0;
        }
    });
    return tri | 0;
}

function start() {
    const els = {
        viewer: must('viewer'),
        modelUrl: must('modelUrl'),
        loadBtn: must('loadBtn'),
        screenshotBtn: must('screenshotBtn'),
        localFile: must('localFile'),
        loadLocal: must('loadLocal'),
        triCount: must('triCount'),
        bboxInfo: must('bboxInfo'),
        scaleInfo: must('scaleInfo'),
        azimuth: must('azimuth'),
        elevation: must('elevation'),
        intensity: must('intensity'),
        grayscale: must('grayscale'),

        // Ölçüm seçici (gizli select DOM'da duruyor)
        measureMode: must('measureMode'),

        // Readout hedefleri: esnek/fallback'lı
        measureReadoutOverlay: document.getElementById('measureReadoutOverlay')
            || document.getElementById('measureReadout') // legacy tek hedef
            || null,
        measureReadoutPanel: document.getElementById('measureReadoutPanel') || null,

        hudMode: must('hudMode'),
        exportCSV: must('exportCSV'),
        clearMarks: must('clearMarks'),

        // Meta
        title: must('title'),
        category: must('category'),
        type: must('type'),
        period: must('period'),
        material: must('material'),
        culture: must('culture'),
        geo: must('geo'),
        abstract: must('abstract'),
        publications: must('publications'),
        saveMeta: must('saveMeta'),

        // Arama
        q: must('q'),
        btnSearch: must('btnSearch'),
        btnSimilar: must('btnSimilar'),
        results: must('results'),

        // Katalog
        loadCatalog: must('loadCatalog'),
        catalogSelect: must('catalogSelect'),
        catalogPreview: must('catalogPreview'),
        applyMeta: must('applyMeta'),
        catalogFile: must('catalogFile'),
        loadCatalogFile: must('loadCatalogFile'),

        // Birimler
        unitSelect: must('unitSelect'),
        metersPerUnit: must('metersPerUnit'),
        calReal: must('calReal'),
        btnCalFromLast: must('btnCalFromLast'),
    };

    function renderHudModelInfo() {
        const hud = els.hudMode;
        if (!hud) return;
        const tri = (els.triCount?.textContent || '-').trim();
        const dims = (els.bboxInfo?.textContent || '-').trim();
        const mpu = (els.scaleInfo?.textContent || '-').trim();
        hud.innerHTML =
            `<b>Üçgen:</b> ${tri} &nbsp;•&nbsp; <b>Boyut:</b> ${dims} &nbsp;•&nbsp; <b>Ölçek:</b> ${mpu} m/birim`;
    }

    // Yardımcı: üç ölçüm aynı birimdeyse (mm/cm/m/ft/in) tekrarı kırp
    function joinDims(a, b, c) {
        const rx = /\s*(mm|cm|m|in|ft)$/;
        const ua = (a.match(rx) || [])[1];
        const ub = (b.match(rx) || [])[1];
        const uc = (c.match(rx) || [])[1];
        if (ua && ua === ub && ua === uc) {
            // sadece son değer birimli kalsın
            return `${a.replace(rx, '')} × ${b.replace(rx, '')} × ${c}`;
        }
        return `${a} × ${b} × ${c}`;
    }

    // Ölçek
    let metersPerUnit = 1.0;
    let lastRoot = null;

    function setMetersPerUnit(v) {
        metersPerUnit = Number(v) || 1;
        els.scaleInfo.textContent = metersPerUnit.toFixed(3);
        els.scaleInfo.title = els.scaleInfo.textContent + ' m/birim';
        if (lastRoot) {
            const size = new THREE.Box3().setFromObject(lastRoot).getSize(new THREE.Vector3());
            const x = fmtLen(size.x * metersPerUnit);
            const y = fmtLen(size.y * metersPerUnit);
            const z = fmtLen(size.z * metersPerUnit);
            els.bboxInfo.textContent = joinDims(x, y, z);
            els.bboxInfo.title = `${x} × ${y} × ${z}`;
            renderHudModelInfo();
        }
    }
    function toMeters(x) { return x * metersPerUnit; }

    // Sahne
    const s = initScene(els.viewer);
    const renderer = s.renderer, scene = s.scene, camera = s.camera, controls = s.controls;

    // GRID toggle
    const gridToggle = document.getElementById('gridToggle');
    if (gridToggle && grid) {
        grid.visible = !!gridToggle.checked;
        gridToggle.addEventListener('change', function () {
            grid.visible = !!gridToggle.checked;
            requestRender();
        });
    }

    // Arka plan rengi
    const bgColor = document.getElementById('bgColor');
    if (bgColor) bgColor.addEventListener('input', function () {
        const c = new THREE.Color(bgColor.value);
        renderer.setClearColor(c, 1);
        requestRender();
    });

    // Işık
    const lighting = initLighting({
        scene: scene,
        renderer: renderer,
        azimuth: els.azimuth,
        elevation: els.elevation,
        intensity: els.intensity,
        grayscale: els.grayscale
    });

    // Directional kapalı/açık
    const dirOff = document.getElementById('dirOff');
    if (dirOff) dirOff.addEventListener('change', function () {
        lighting.sun.visible = !dirOff.checked;
        requestRender();
    });

    // Filtreler (composer)
    const filters = initFilters({ renderer, scene, camera, setRenderOverride });

    // Resize’da composer’ı güncelle
    window.addEventListener('resize', () => { if (filters && filters.resize) filters.resize(); });

    // ---- RAKING UI ----
    const fxRaking = document.getElementById('fxRaking');
    const rGain = document.getElementById('rGain');   // 0.5–3.0
    const rWrap = document.getElementById('rWrap');   // 0.0–0.6

    // İlk durum senkronu
    if (fxRaking && fxRaking.checked) {
        filters.enableRaking(true);
        const az0 = Number(els.azimuth.value || 45);
        const el0 = Number(els.elevation.value || 30);
        filters.setRakingLightDirFromAzEl(az0, el0);
        if (rGain || rWrap) {
            filters.setRakingParams({
                gain: Number(rGain?.value || 1.2),
                wrap: Number(rWrap?.value || 0.3)
            });
        }
        requestRender();
    }

    if (fxRaking) {
        fxRaking.addEventListener('change', () => {
            const on = !!fxRaking.checked;
            filters.enableRaking(on);
            if (on) {
                const az = Number(els.azimuth.value || 45);
                const el = Number(els.elevation.value || 30);
                filters.setRakingLightDirFromAzEl(az, el);
                if (rGain || rWrap) {
                    filters.setRakingParams({
                        gain: Number(rGain?.value || 1.2),
                        wrap: Number(rWrap?.value || 0.3)
                    });
                }
            }
            requestRender();
        });
    }

    // Azimuth/Elevation değişince raking yönünü güncelle
    els.azimuth.addEventListener('input', () => {
        const az = Number(els.azimuth.value || 45);
        const el = Number(els.elevation.value || 30);
        if (fxRaking?.checked) filters.setRakingLightDirFromAzEl(az, el);
        requestRender();
    });
    els.elevation.addEventListener('input', () => {
        const az = Number(els.azimuth.value || 45);
        const el = Number(els.elevation.value || 30);
        if (fxRaking?.checked) filters.setRakingLightDirFromAzEl(az, el);
        requestRender();
    });

    // (opsiyonel) raking parametre slider’ları
    if (rGain || rWrap) {
        const pushParams = () => {
            filters.setRakingParams({
                gain: Number(rGain?.value || 1.2),
                wrap: Number(rWrap?.value || 0.3)
            });
            requestRender();
        };
        rGain?.addEventListener('input', pushParams);
        rWrap?.addEventListener('input', pushParams);
    }

    // --- FOV / CAMERA MODE UI ---
    const fovSlider = document.getElementById('fovSlider');
    if (fovSlider) {
        fovSlider.addEventListener('input', () => {
            setFov(Number(fovSlider.value)); // 20–120
            requestRender();
        });
    }

    const btnPerspective = document.getElementById('btnPerspective');
    if (btnPerspective) {
        btnPerspective.addEventListener('click', () => {
            switchToPerspective();
            if (filters.setCamera) filters.setCamera(getCamera());
            requestRender();
        });
    }

    const btnOrtho = document.getElementById('btnOrtho');
    if (btnOrtho) {
        btnOrtho.addEventListener('click', () => {
            switchToOrthographic();
            if (filters.setCamera) filters.setCamera(getCamera());
            // Ortho’da SSAO kapatalım
            const cb = document.getElementById('fxSsao');
            if (cb && cb.checked) cb.checked = false;
            if (filters.enableSSAO) filters.enableSSAO(false);
            requestRender();
        });
    }

    // Filtre kontrolleri
    const fxSSAO = document.getElementById('fxSsao');
    const fxEdges = document.getElementById('fxEdges');
    const fxQual = document.getElementById('fxQuality');
    const fxCurv = document.getElementById('fxCurv');
    const fxCurvAmt = document.getElementById('fxCurvAmt');

    // İlk durum senkronu
    if (fxSSAO) { filters.enableSSAO(!!fxSSAO.checked); }
    if (fxEdges) { filters.enableEdges(!!fxEdges.checked); }
    if (fxCurv) { filters.enableCurvature(!!fxCurv.checked); }
    if (fxCurvAmt) { filters.setCurvatureStrength((Number(fxCurvAmt.value) || 80) / 100); }
    if (fxQual) { filters.setQuality(fxQual.value); }
    requestRender();

    // Eventler
    if (fxSSAO) fxSSAO.addEventListener('change', () => { filters.enableSSAO(!!fxSSAO.checked); requestRender(); });
    if (fxEdges) fxEdges.addEventListener('change', () => { filters.enableEdges(!!fxEdges.checked); requestRender(); });
    if (fxQual) fxQual.addEventListener('change', () => { filters.setQuality(fxQual.value); requestRender(); });
    if (fxCurv) fxCurv.addEventListener('change', () => { filters.enableCurvature(!!fxCurv.checked); requestRender(); });
    if (fxCurvAmt) fxCurvAmt.addEventListener('input', () => {
        filters.setCurvatureStrength((Number(fxCurvAmt.value) || 80) / 100);
        requestRender();
    });

    // ===== Ölçüm =====

    // 1) Ölçüm metnini overlay + panel birlikte güncelleyen global fonksiyon.
    window.updateReadout = function (html) {
        const o = els.measureReadoutOverlay;
        const p = els.measureReadoutPanel;
        if (o) o.innerHTML = html;
        if (p) p.innerHTML = html;
    };

    // 2) Ölçüm modülü
    const measure = initMeasurements({
        scene: scene,
        camera: camera,
        renderer: renderer,
        // readoutEl kritik değil; overlay'i versek de yukarıdaki global her şeyi günceller
        readoutEl: els.measureReadoutOverlay,
        hudModeEl: els.hudMode,
        toMeters: toMeters,
        fmtLen: fmtLen
    });
    measure.attachCanvas(getDomElement());
    renderHudModelInfo();

    // 3) Ray butonları ve select senkronu (TOGGLE mantığı dahil)
    function updateMeasureUI(mode) {
        const rail = document.getElementById('measureRail');
        if (!rail) return;
        rail.querySelectorAll('.toolbtn').forEach(btn => {
            const active = btn.dataset.mode === mode;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    els.measureMode.addEventListener('change', function () {
        const mode = els.measureMode.value || 'none';
        measure.setMode(mode);     // measurements.js -> clear() çağırır ve HUD/Readout'u günceller
        updateMeasureUI(mode);     // ray butonlarını boya
        if (mode === 'none') {
            // none'a geçince overlay/panel'i "Ölçüm" olarak sıfırla (garanti)
            window.updateReadout('<span class="muted">Ölçüm</span>');
        }
    });

    (function wireMeasureRail() {
        const rail = document.getElementById('measureRail');
        if (!rail) return; // ray yoksa sadece dropdown ile çalışır
        const btns = rail.querySelectorAll('.toolbtn');
        if (!btns.length) return;

        function applyMode(nextMode) {
            const current = els.measureMode.value || 'none';
            const mode = (current === nextMode) ? 'none' : nextMode; // aynı butona basınca kapat
            els.measureMode.value = mode;
            els.measureMode.dispatchEvent(new Event('change', { bubbles: true }));
        }

        btns.forEach(b => b.addEventListener('click', () => applyMode(b.dataset.mode)));

        // başlangıç boyaması
        updateMeasureUI(els.measureMode.value || 'none');
    })();

    // ESC ile hızlı kapatma
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (els.measureMode.value || 'none') !== 'none') {
            els.measureMode.value = 'none';
            els.measureMode.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    // Clear / CSV
    els.clearMarks.addEventListener('click', function () { measure.clear(); });
    els.exportCSV.addEventListener('click', function () { measure.exportCSV(); });

    // ===== Loader =====
    const loader = initLoader({
        scene: scene, camera: camera, controls: controls, renderer: renderer,
        onAfterLoad: function (r) {
            const root = r.root, mesh = r.mesh;
            lastRoot = root;
            measure.setTargetMesh(mesh);

            // BBox ve üçgen sayısı
            const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            const x = fmtLen(size.x * metersPerUnit);
            const y = fmtLen(size.y * metersPerUnit);
            const z = fmtLen(size.z * metersPerUnit);
            els.bboxInfo.textContent = joinDims(x, y, z);
            els.bboxInfo.title = `${x} × ${y} × ${z}`;

            try {
                const tri = countTriangles(root);
                els.triCount.textContent = tri.toLocaleString('tr-TR');
                els.triCount.title = els.triCount.textContent;
            } catch (e) { console.warn('Tri count failed:', e); }
            renderHudModelInfo();
        }
    });

    // MODEL
    els.loadBtn.addEventListener('click', function () { loader.loadFromURL(els.modelUrl.value); });
    els.loadLocal.addEventListener('click', function () {
        const f = els.localFile.files && els.localFile.files[0];
        if (!f) { flash('Bir .glb/.gltf dosyası seçin.'); return; }
        loader.loadFromFile(f);
    });
    els.screenshotBtn.addEventListener('click', function () {
        const a = document.createElement('a');
        a.href = renderer.domElement.toDataURL('image/png');
        a.download = 'screenshot.png';
        a.click();
    });

    // META / ARAMA
    const meta = initMetadata({
        inputs: {
            title: els.title, category: els.category, type: els.type, period: els.period,
            material: els.material, culture: els.culture, geo: els.geo, abstract: els.abstract, publications: els.publications
        },
        saveBtn: els.saveMeta,
        resultsEl: els.results,
        queryInput: els.q,
        btnSearch: els.btnSearch,
        btnSimilar: els.btnSimilar,
        getCurrentId: function () { return (els.modelUrl.value || '').trim(); }
    });

    // KATALOG
    initCatalog({
        loadBtn: els.loadCatalog,
        selectEl: els.catalogSelect,
        previewEl: els.catalogPreview,
        applyBtn: els.applyMeta,
        setModelUrl: function (url) { els.modelUrl.value = url; },
        loadByUrl: function (url) { loader.loadFromURL(url); },
        fillMeta: function (rec) {
            els.title.value = rec.title || '';
            els.category.value = rec.category || '';
            els.type.value = rec.type || '';
            els.period.value = rec.period || '';
            els.material.value = rec.material || '';
            els.culture.value = rec.culture || '';
            els.geo.value = rec.geo || '';
            els.abstract.value = rec.abstract || '';
            const pubs = (rec.publications || []);
            const lines = [];
            for (let i = 0; i < pubs.length; i++) {
                const p = pubs[i], v = p.doi || p.url || p.title;
                if (v) lines.push(v);
            }
            els.publications.value = lines.join('\n');
            if (rec.metersPerUnit) {
                els.metersPerUnit.value = rec.metersPerUnit;
                setMetersPerUnit(rec.metersPerUnit);
            }
        },
        onLoaded: function (items) { meta.seed(items); },
        fileInput: els.catalogFile,
        loadFileBtn: els.loadCatalogFile
    });

    // Birim seçimleri
    els.unitSelect.addEventListener('change', function () {
        const v = els.unitSelect.value;
        const map = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };
        if (v === 'custom') { els.metersPerUnit.focus(); return; }
        els.metersPerUnit.value = map[v];
        setMetersPerUnit(map[v]);
    });
    els.metersPerUnit.addEventListener('change', function () {
        setMetersPerUnit(parseFloat(els.metersPerUnit.value));
    });

    // Kalibrasyon
    els.btnCalFromLast.addEventListener('click', function () {
        const lastUnits = measure.getLastLengthUnits();
        const realMeters = parseFloat(els.calReal.value);
        if (!lastUnits || !isFinite(lastUnits)) { flash('Önce bir ölçüm yapın.'); return; }
        if (!realMeters || !isFinite(realMeters)) { flash('Gerçek uzunluğu metre olarak girin.'); return; }
        const mpu = realMeters / lastUnits;
        els.metersPerUnit.value = mpu;
        setMetersPerUnit(mpu);
        flash('Kalibrasyon uygulandı.');
    });

    // Mobile panel toggle
    const toggleBtn = document.getElementById('toggleSidebar');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            document.body.classList.toggle('sidebar-hidden');
            window.dispatchEvent(new Event('resize'));
        });
    }

    // Otomatik yükle
    if (els.modelUrl.value) loader.loadFromURL(els.modelUrl.value);
}

// DOM hazırsa hemen çalıştır, değilse bekle
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
