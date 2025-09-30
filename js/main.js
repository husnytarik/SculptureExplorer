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
    if (!el) {
        const msg = '[main] DOM id bulunamadı: #' + id;
        console.error(msg);
        flash(msg);
    }
    return document.getElementById(id) || null;
}
function soft(id) { return document.getElementById(id) || null; }

// ---------- Overlay / HUD yardımcıları ----------
function ensureOverlayRoot(viewerEl) {
    let overlay = viewerEl.querySelector('.overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '10px';
        overlay.style.left = '10px';
        viewerEl.appendChild(overlay);
    }
    return overlay;
}
function ensureHudInfo(viewerEl) {
    let el = document.getElementById('hudInfo');
    if (!el) {
        el = document.createElement('span');
        el.id = 'hudInfo';
        el.className = 'hudline';
        ensureOverlayRoot(viewerEl).appendChild(el);
    }
    return el;
}
function ensureMeasureOverlay(viewerEl) {
    let el = document.getElementById('measureReadoutOverlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'measureReadoutOverlay';
        el.className = 'measure-readout measure-readout--overlay';
        viewerEl.appendChild(el);
    }
    return el;
}

// ---------- Yardımcılar ----------
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
function joinDims(a, b, c) {
    const rx = /\s*(mm|cm|m|in|ft)$/;
    const ua = (a.match(rx) || [])[1];
    const ub = (b.match(rx) || [])[1];
    const uc = (c.match(rx) || [])[1];
    if (ua && ua === ub && ua === uc) {
        return `${a.replace(rx, '')} × ${b.replace(rx, '')} × ${c}`;
    }
    return `${a} × ${b} × ${c}`;
}

function start() {
    const els = {
        viewer: must('viewer'),
        modelUrl: must('modelUrl'),
        loadBtn: must('loadBtn'),
        screenshotBtn: must('screenshotBtn'),
        localFile: soft('localFile'),
        loadLocal: soft('loadLocal'),

        // İstatistikler (opsiyonel olabilir)
        triCount: soft('triCount'),
        bboxInfo: soft('bboxInfo'),
        scaleInfo: soft('scaleInfo'),

        // Işık / görünüm
        azimuth: must('azimuth'),
        elevation: must('elevation'),
        intensity: must('intensity'),
        grayscale: must('grayscale'),

        // Ölçüm
        measureMode: must('measureMode'),
        measureReadoutOverlay: soft('measureReadoutOverlay') || soft('measureReadout') || null,
        measureReadoutPanel: soft('measureReadoutPanel') || null,

        hudMode: document.getElementById('hudMode'), // opsiyonel (ölçüm modülüne geçer)
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
        editMeta: must('editMeta'),

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
        catalogFile: soft('catalogFile'),
        loadCatalogFile: soft('loadCatalogFile'),
    };

    function metaFields() {
        return [
            els.title, els.category, els.type, els.period,
            els.material, els.culture, els.geo, els.abstract, els.publications
        ].filter(Boolean);
    }

    function setMetaEditable(on) {
        metaFields().forEach(el => {
            if ('readOnly' in el) el.readOnly = !on;
            // görsel ipucu için class
            el.classList.toggle('is-readonly', !on);
        });
        // Kaydet sadece düzenleme açıkken aktif
        if (els.saveMeta) els.saveMeta.disabled = !on;

        // Düzenle butonu durumu
        if (els.editMeta) {
            els.editMeta.textContent = on ? 'Vazgeç' : 'Düzenle';
            els.editMeta.setAttribute('aria-pressed', on ? 'true' : 'false');
            els.editMeta.dataset.editing = on ? 'true' : 'false';
        }
    }

    // başta kilitli başlat:
    setMetaEditable(false);

    // butonu bağla:
    els.editMeta.addEventListener('click', () => {
        const now = els.editMeta.dataset.editing === 'true';
        setMetaEditable(!now);
    });

    // ---------- STATE ----------
    let metersPerUnit = 1.0;     // Kart kaldırıldığı için default 1
    let bboxSizeRaw = null;      // THREE.Vector3 | null
    let triCountVal = null;      // number | null

    // HUD satırı (Üçgen • Boyut • Ölçek)
    let hudInfoEl = null;
    function renderHudModelInfo() {
        const hud = hudInfoEl || ensureHudInfo(els.viewer);
        if (!hud) return;

        const triText = (triCountVal != null) ? triCountVal.toLocaleString('tr-TR') : '-';

        let dimsText = '-';
        if (bboxSizeRaw) {
            const x = fmtLen(bboxSizeRaw.x * metersPerUnit);
            const y = fmtLen(bboxSizeRaw.y * metersPerUnit);
            const z = fmtLen(bboxSizeRaw.z * metersPerUnit);
            dimsText = joinDims(x, y, z);
        }

        const mpuText = (isFinite(metersPerUnit) ? metersPerUnit.toFixed(3) : '-');

        // düz metin
        hud.textContent = `Üçgen: ${triText} • Boyut: ${dimsText} • Ölçek: ${mpuText} m/birim`;
    }

    function setMetersPerUnit(v) {
        metersPerUnit = Number(v) || 1;

        // (varsa) yandaki "Ölçek" alanını güncelle
        if (els.scaleInfo) {
            els.scaleInfo.textContent = metersPerUnit.toFixed(3);
            els.scaleInfo.title = els.scaleInfo.textContent + ' m/birim';
        }

        // (varsa) yandaki "Boyut" alanını güncelle
        if (bboxSizeRaw && els.bboxInfo) {
            const x = fmtLen(bboxSizeRaw.x * metersPerUnit);
            const y = fmtLen(bboxSizeRaw.y * metersPerUnit);
            const z = fmtLen(bboxSizeRaw.z * metersPerUnit);
            els.bboxInfo.textContent = joinDims(x, y, z);
            els.bboxInfo.title = `${x} × ${y} × ${z}`;
        }

        renderHudModelInfo();
        if (typeof requestRender === 'function') requestRender();
    }
    function toMeters(x) { return x * metersPerUnit; }

    // ---------- SAHNE ----------
    const s = initScene(els.viewer);
    const renderer = s.renderer, scene = s.scene, camera = s.camera, controls = s.controls;

    // HUD & Readout elementlerini garanti altına al
    hudInfoEl = ensureHudInfo(els.viewer);
    ensureMeasureOverlay(els.viewer);

    // Ölçüm Readout bridge (overlay + panel birlikte güncellensin)
    if (typeof window.updateReadout !== 'function') {
        window.updateReadout = function (html) {
            const o = ensureMeasureOverlay(els.viewer);
            o.innerHTML = html;
            const p = document.getElementById('measureReadoutPanel');
            if (p) p.innerHTML = html;
        };
    }

    // GRID toggle
    const gridToggle = soft('gridToggle');
    if (gridToggle && grid) {
        grid.visible = !!gridToggle.checked;
        gridToggle.addEventListener('change', function () {
            grid.visible = !!gridToggle.checked;
            requestRender();
        });
    }

    // Arka plan rengi
    const bgColor = soft('bgColor');
    if (bgColor) {
        const c = new THREE.Color(bgColor.value || '#5a5a5a');
        renderer.setClearColor(c, 1);
        requestRender();
        bgColor.addEventListener('input', function () {
            const c = new THREE.Color(bgColor.value);
            renderer.setClearColor(c, 1);
            requestRender();
        });
    }

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
    const dirOff = soft('dirOff');
    if (dirOff) dirOff.addEventListener('change', function () {
        lighting.sun.visible = !dirOff.checked;
        requestRender();
    });

    // Postprocess: sadece Curvature + Edges
    const filters = initFilters({ renderer, scene, camera, setRenderOverride });
    window.addEventListener('resize', () => { if (filters && filters.resize) filters.resize(); });

    // --- FOV / CAMERA MODE ---
    const fovSlider = soft('fovSlider');
    if (fovSlider) {
        setFov(Number(fovSlider.value || 45));
        requestRender();
        fovSlider.addEventListener('input', () => {
            setFov(Number(fovSlider.value));
            requestRender();
        });
    }
    const btnPerspective = soft('btnPerspective');
    if (btnPerspective) {
        btnPerspective.addEventListener('click', () => {
            switchToPerspective();
            if (filters.setCamera) filters.setCamera(getCamera());
            requestRender();
        });
    }
    const btnOrtho = soft('btnOrtho');
    if (btnOrtho) {
        btnOrtho.addEventListener('click', () => {
            switchToOrthographic();
            if (filters.setCamera) filters.setCamera(getCamera());
            requestRender();
        });
    }

    // --- Işık & Görünüm panel toggle ---
    const viewPanel = soft('viewPanel');
    const btnViewPanel = soft('btnViewPanel');
    const altToggleBtn = soft('toggleViewPanel');

    function syncViewBtn() {
        if (!btnViewPanel || !viewPanel) return;
        const opened = !viewPanel.hidden;
        btnViewPanel.classList.toggle('is-active', opened);
        btnViewPanel.setAttribute('aria-pressed', opened ? 'true' : 'false');
    }
    function toggleViewPanel() {
        if (!viewPanel) return;
        viewPanel.hidden = !viewPanel.hidden;
        syncViewBtn();
        requestRender?.();
    }
    btnViewPanel?.addEventListener('click', toggleViewPanel);
    altToggleBtn?.addEventListener('click', toggleViewPanel);

    // Panel dışına tıklayınca kapat
    document.addEventListener('mousedown', (e) => {
        if (!viewPanel || viewPanel.hidden) return;
        const inside = viewPanel.contains(e.target);
        const onToggle = btnViewPanel?.contains(e.target) || altToggleBtn?.contains?.(e.target);
        if (!inside && !onToggle) {
            viewPanel.hidden = true;
            syncViewBtn();
        }
    });

    // --- Viewer Filters (sağ alt) ---
    const btnCurv = soft('btnCurv');
    const btnEdges = soft('btnEdges');
    const curvPopover = soft('curvPopover');
    const curvAmt = soft('curvAmt');

    let curvEnabled = false;
    let edgesEnabled = false;

    function setBtnState(btn, on) {
        if (!btn) return;
        btn.classList.toggle('is-active', !!on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    // Curvature toggle + popover
    if (btnCurv) {
        if (curvPopover) curvPopover.hidden = true; // başlangıçta gizli
        btnCurv.addEventListener('click', () => {
            curvEnabled = !curvEnabled;
            filters.enableCurvature(curvEnabled);
            setBtnState(btnCurv, curvEnabled);

            if (curvPopover) curvPopover.hidden = !curvEnabled;
            if (curvEnabled && curvAmt) {
                filters.setCurvatureStrength((Number(curvAmt.value) || 80) / 100);
            }
            requestRender();
        });
    }
    if (curvAmt) {
        curvAmt.addEventListener('input', () => {
            if (curvEnabled) {
                filters.setCurvatureStrength((Number(curvAmt.value) || 80) / 100);
                requestRender();
            }
        });
    }

    // Edges toggle
    if (btnEdges) {
        btnEdges.addEventListener('click', () => {
            edgesEnabled = !edgesEnabled;
            filters.enableEdges(edgesEnabled);
            setBtnState(btnEdges, edgesEnabled);
            requestRender();
        });
    }

    // Curvature popover dışına tıklanınca sadece popover gizle (efekt açık kalsın)
    document.addEventListener('mousedown', (e) => {
        if (!curvPopover || curvPopover.hidden) return;
        const inside = curvPopover.contains(e.target);
        const onBtn = btnCurv?.contains(e.target);
        if (!inside && !onBtn) curvPopover.hidden = true;
    });

    // ESC ile kapatmalar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // ölçüm modu açıksa kapat
            if ((els.measureMode.value || 'none') !== 'none') {
                els.measureMode.value = 'none';
                els.measureMode.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // view panel açıksa kapat
            if (viewPanel && !viewPanel.hidden) { viewPanel.hidden = true; syncViewBtn(); }
            // curvature popover açıksa kapat
            if (curvPopover && !curvPopover.hidden) curvPopover.hidden = true;
        }
    });

    // ---------- Ölçüm ----------
    window.updateReadout = function (html) {
        const o = els.measureReadoutOverlay;
        const p = els.measureReadoutPanel;
        if (o) o.innerHTML = html;
        if (p) p.innerHTML = html;
    };

    const measure = initMeasurements({
        scene, camera, renderer,
        readoutEl: els.measureReadoutOverlay,
        hudModeEl: els.hudMode,
        toMeters, fmtLen
    });
    measure.attachCanvas(getDomElement());
    renderHudModelInfo();

    function updateMeasureUI(mode) {
        const rail = soft('measureRail');
        if (!rail) return;
        rail.querySelectorAll('.toolbtn').forEach(btn => {
            const active = btn.dataset.mode === mode;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }
    els.measureMode.addEventListener('change', function () {
        const mode = els.measureMode.value || 'none';
        measure.setMode(mode);
        updateMeasureUI(mode);
        if (mode === 'none') {
            window.updateReadout('<span class="muted">Ölçüm</span>');
        }
    });
    (function wireMeasureRail() {
        const rail = soft('measureRail');
        if (!rail) return;
        const btns = rail.querySelectorAll('.toolbtn');
        if (!btns.length) return;

        function applyMode(nextMode) {
            const current = els.measureMode.value || 'none';
            const mode = (current === nextMode) ? 'none' : nextMode;
            els.measureMode.value = mode;
            els.measureMode.dispatchEvent(new Event('change', { bubbles: true }));
        }
        btns.forEach(b => b.addEventListener('click', () => applyMode(b.dataset.mode)));
        updateMeasureUI(els.measureMode.value || 'none');
    })();

    // Clear / CSV
    els.clearMarks.addEventListener('click', function () { measure.clear(); });
    els.exportCSV.addEventListener('click', function () { measure.exportCSV(); });

    // ---------- Loader ----------
    const loader = initLoader({
        scene, camera, controls, renderer,
        onAfterLoad: function (r) {
            const root = r.root, mesh = r.mesh;

            // BBox (ham birimde)
            const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            bboxSizeRaw = size.clone();

            // Üçgen sayısı
            try {
                triCountVal = countTriangles(root);
                if (els.triCount) {
                    els.triCount.textContent = triCountVal.toLocaleString('tr-TR');
                    els.triCount.title = els.triCount.textContent;
                }
            } catch (e) { console.warn('Tri count failed:', e); }

            // Sidebar “Boyut” alanı varsa doldur (opsiyonel)
            if (els.bboxInfo) {
                const x = fmtLen(bboxSizeRaw.x * metersPerUnit);
                const y = fmtLen(bboxSizeRaw.y * metersPerUnit);
                const z = fmtLen(bboxSizeRaw.z * metersPerUnit);
                els.bboxInfo.textContent = joinDims(x, y, z);
                els.bboxInfo.title = `${x} × ${y} × ${z}`;
            }

            // Ölçüm hedefi
            measure.setTargetMesh(mesh);

            // HUD’ı güncelle
            renderHudModelInfo();
        }
    });

    // MODEL
    els.loadBtn?.addEventListener('click', function () {
        loader.loadFromURL(els.modelUrl.value);
    });
    if (els.loadLocal && els.localFile) {
        els.loadLocal.addEventListener('click', function () {
            const f = els.localFile.files && els.localFile.files[0];
            if (!f) { flash('Bir .glb/.gltf dosyası seçin.'); return; }
            loader.loadFromFile(f);
        });
    }
    els.screenshotBtn?.addEventListener('click', function () {
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

            // Kart kaldırıldı; UI alanına yazmadan sadece state'e uygula
            if (rec.metersPerUnit) setMetersPerUnit(rec.metersPerUnit);
        },
        onLoaded: function (items) { meta.seed(items); },
        fileInput: els.catalogFile,
        loadFileBtn: els.loadCatalogFile
    });

    // Mobil panel toggle
    const toggleBtn = soft('toggleSidebar');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            document.body.classList.toggle('sidebar-hidden');
            window.dispatchEvent(new Event('resize'));
        });
    }

    // İlk senkron
    syncViewBtn();

    // Otomatik yükle
    if (els.modelUrl.value) loader.loadFromURL(els.modelUrl.value);
}

// DOM hazırsa hemen çalıştır, değilse bekle
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
