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
    return el;
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
    if (ua && ua === ub && ua === uc) return `${a.replace(rx, '')} × ${b.replace(rx, '')} × ${c}`;
    return `${a} × ${b} × ${c}`;
}

function start() {
    const els = {
        viewer: must('viewer'),

        // İstatistikler (opsiyonel)
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

        hudMode: soft('hudMode'),
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
        catalogPreview: soft('catalogPreview'),       // <<< opsiyonel
        applyMeta: must('applyMeta'),
        catalogFile: soft('catalogFile'),
        loadCatalogFile: soft('loadCatalogFile'),

        // View panel toggles
        viewPanel: soft('viewPanel'),
        btnViewPanel: soft('btnViewPanel'),
        altToggleBtn: soft('toggleViewPanel'),
    };

    // === Meta düzenleme kilidi ===
    function metaFields() {
        return [
            els.title, els.category, els.type, els.period,
            els.material, els.culture, els.geo, els.abstract, els.publications
        ].filter(Boolean);
    }
    function setMetaEditable(on) {
        metaFields().forEach(el => {
            if ('readOnly' in el) el.readOnly = !on;
            el.classList.toggle('is-readonly', !on);
        });
        if (els.saveMeta) els.saveMeta.disabled = !on;
        if (els.editMeta) {
            els.editMeta.textContent = on ? 'Vazgeç' : 'Düzenle';
            els.editMeta.setAttribute('aria-pressed', on ? 'true' : 'false');
            els.editMeta.dataset.editing = on ? 'true' : 'false';
        }
    }
    setMetaEditable(false);
    els.editMeta?.addEventListener('click', () =>
        setMetaEditable(!(els.editMeta?.dataset.editing === 'true'))
    );

    // === STATE ===
    let metersPerUnit = 1.0;
    let bboxSizeRaw = null;
    let triCountVal = null;
    let currentModelId = ''; // katalogdan yüklenen aktif model

    // HUD satırı
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
        hud.textContent = `Üçgen: ${triText} • Boyut: ${dimsText} • Ölçek: ${mpuText} m/birim`;
    }
    function setMetersPerUnit(v) {
        metersPerUnit = Number(v) || 1;
        if (els.scaleInfo) {
            els.scaleInfo.textContent = metersPerUnit.toFixed(3);
            els.scaleInfo.title = els.scaleInfo.textContent + ' m/birim';
        }
        if (bboxSizeRaw && els.bboxInfo) {
            const x = fmtLen(bboxSizeRaw.x * metersPerUnit);
            const y = fmtLen(bboxSizeRaw.y * metersPerUnit);
            const z = fmtLen(bboxSizeRaw.z * metersPerUnit);
            els.bboxInfo.textContent = joinDims(x, y, z);
            els.bboxInfo.title = `${x} × ${y} × ${z}`;
        }
        renderHudModelInfo();
        requestRender?.();
    }
    function toMeters(x) { return x * metersPerUnit; }

    // === SAHNE ===
    const s = initScene(els.viewer);
    const renderer = s.renderer, scene = s.scene, camera = s.camera, controls = s.controls;

    hudInfoEl = ensureHudInfo(els.viewer);
    ensureMeasureOverlay(els.viewer);

    // Ölçüm readout (tek tanım)
    window.updateReadout = function (html) {
        const o = els.measureReadoutOverlay;
        const p = els.measureReadoutPanel;
        if (o) o.innerHTML = html;
        if (p) p.innerHTML = html;
    };

    // Grid
    const gridToggle = soft('gridToggle');
    if (gridToggle && grid) {
        grid.visible = !!gridToggle.checked;
        gridToggle.addEventListener('change', () => { grid.visible = !!gridToggle.checked; requestRender(); });
    }

    // === Viewer arka planı: tek kaynak CSS var(--viewer-bg) ===
    const bgColor = soft('bgColor');
    const viewerEl = els.viewer;

    function cssVar(el, name, fallback = '#000000') {
        const v = getComputedStyle(el).getPropertyValue(name).trim();
        return v || fallback;
    }
    function toHex(c) {
        const v = c.toLowerCase();
        if (v.startsWith('#')) return v;
        const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
            const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
            const h = (n) => n.toString(16).padStart(2, '0');
            return `#${h(r)}${h(g)}${h(b)}`;
        }
        return '#000000';
    }

    const defaultCss = cssVar(viewerEl, '--viewer-bg', '#000000');
    const defaultHex = toHex(defaultCss);
    renderer.setClearColor(new THREE.Color(defaultHex), 1);
    requestRender();

    if (bgColor) {
        if (!bgColor.value) bgColor.value = defaultHex;
        bgColor.addEventListener('input', () => {
            const hex = bgColor.value || defaultHex;
            viewerEl.style.setProperty('--viewer-bg', hex);
            renderer.setClearColor(new THREE.Color(hex), 1);
            requestRender();
        });
    }

    // Işık
    const lighting = initLighting({
        scene, renderer,
        azimuth: els.azimuth, elevation: els.elevation, intensity: els.intensity, grayscale: els.grayscale
    });
    soft('dirOff')?.addEventListener('change', e => { lighting.sun.visible = !e.target.checked; requestRender(); });

    // Post-process (Curvature + Edges)
    const filters = initFilters({ renderer, scene, camera, setRenderOverride });
    window.addEventListener('resize', () => { filters?.resize?.(); });

    // Kamera/FOV
    const fovSlider = soft('fovSlider');
    if (fovSlider) {
        setFov(Number(fovSlider.value || 45)); requestRender();
        fovSlider.addEventListener('input', () => { setFov(Number(fovSlider.value)); requestRender(); });
    }
    soft('btnPerspective')?.addEventListener('click', () => { switchToPerspective(); filters.setCamera?.(getCamera()); requestRender(); });
    soft('btnOrtho')?.addEventListener('click', () => { switchToOrthographic(); filters.setCamera?.(getCamera()); requestRender(); });

    // === Işık & Görünüm paneli — butonun ALTINDA ===
    const viewPanel = els.viewPanel;
    const btnViewPanel = els.btnViewPanel;
    const altToggleBtn = els.altToggleBtn;

    function syncViewBtn() {
        if (!btnViewPanel || !viewPanel) return;
        const opened = !viewPanel.hidden;
        btnViewPanel.classList.toggle('is-active', opened);
        btnViewPanel.setAttribute('aria-pressed', opened ? 'true' : 'false');
    }
    function placeViewPanelUnderBtn() {
        if (!viewPanel || !btnViewPanel) return;
        const wasHidden = viewPanel.hidden; if (wasHidden) viewPanel.hidden = false;

        const vr = els.viewer.getBoundingClientRect();
        const br = btnViewPanel.getBoundingClientRect();
        const pr = viewPanel.getBoundingClientRect();
        const GAP = 8, PAD = 10;

        let top = (br.bottom - vr.top) + GAP;
        let right = Math.max(PAD, vr.right - br.right);

        const maxTop = vr.height - pr.height - PAD;
        if (top > maxTop) top = (br.top - vr.top) - pr.height - GAP;
        top = Math.max(PAD, Math.min(top, maxTop));

        Object.assign(viewPanel.style, { top: `${top}px`, right: `${right}px`, left: 'auto', bottom: 'auto' });
        if (wasHidden) viewPanel.hidden = true;
    }
    function openViewPanel() { if (!viewPanel) return; viewPanel.hidden = false; placeViewPanelUnderBtn(); syncViewBtn(); }
    function closeViewPanel() { if (!viewPanel) return; viewPanel.hidden = true; syncViewBtn(); }
    function onViewBtnClick() { if (viewPanel.hidden) openViewPanel(); else closeViewPanel(); }

    btnViewPanel?.addEventListener('click', onViewBtnClick);
    altToggleBtn?.addEventListener('click', onViewBtnClick);
    document.addEventListener('mousedown', (e) => {
        if (!viewPanel || viewPanel.hidden) return;
        const inside = viewPanel.contains(e.target);
        const onToggle = btnViewPanel?.contains(e.target) || altToggleBtn?.contains?.(e.target);
        if (!inside && !onToggle) closeViewPanel();
    });
    window.addEventListener('resize', () => { if (!viewPanel?.hidden) placeViewPanelUnderBtn(); });

    // === Viewer Filters (sağ alt) ===
    const btnCurv = soft('btnCurv');
    const btnEdges = soft('btnEdges');
    const curvPopover = soft('curvPopover');
    const curvAmt = soft('curvAmt');
    let curvEnabled = false, edgesEnabled = false;

    function setBtnState(btn, on) { if (!btn) return; btn.classList.toggle('is-active', !!on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    if (btnCurv) {
        if (curvPopover) curvPopover.hidden = true;
        btnCurv.addEventListener('click', () => {
            curvEnabled = !curvEnabled;
            filters.enableCurvature(curvEnabled);
            setBtnState(btnCurv, curvEnabled);
            if (curvPopover) curvPopover.hidden = !curvEnabled;
            if (curvEnabled && curvAmt) filters.setCurvatureStrength((Number(curvAmt.value) || 80) / 100);
            requestRender();
        });
    }
    curvAmt?.addEventListener('input', () => {
        if (curvEnabled) { filters.setCurvatureStrength((Number(curvAmt.value) || 80) / 100); requestRender(); }
    });
    btnEdges?.addEventListener('click', () => {
        edgesEnabled = !edgesEnabled;
        filters.enableEdges(edgesEnabled);
        setBtnState(btnEdges, edgesEnabled);
        requestRender();
    });
    document.addEventListener('mousedown', (e) => {
        if (!curvPopover || curvPopover.hidden) return;
        const inside = curvPopover.contains(e.target);
        const onBtn = btnCurv?.contains(e.target);
        if (!inside && !onBtn) curvPopover.hidden = true;
    });

    // ESC kısayolu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if ((els.measureMode.value || 'none') !== 'none') {
                els.measureMode.value = 'none';
                els.measureMode.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (viewPanel && !viewPanel.hidden) closeViewPanel();
            if (curvPopover && !curvPopover.hidden) curvPopover.hidden = true;
        }
    });

    // === Ölçüm ===
    const measure = initMeasurements({
        scene, camera, renderer,
        readoutEl: els.measureReadoutOverlay,
        hudModeEl: els.hudMode,
        toMeters, fmtLen
    });
    measure.attachCanvas(getDomElement());
    renderHudModelInfo();

    function updateMeasureUI(mode) {
        const rail = soft('measureRail'); if (!rail) return;
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
        if (mode === 'none') window.updateReadout('<span class="muted">Ölçüm</span>');
    });
    (function wireMeasureRail() {
        const rail = soft('measureRail'); if (!rail) return;
        const btns = rail.querySelectorAll('.toolbtn'); if (!btns.length) return;
        function applyMode(nextMode) {
            const current = els.measureMode.value || 'none';
            const mode = (current === nextMode) ? 'none' : nextMode;
            els.measureMode.value = mode;
            els.measureMode.dispatchEvent(new Event('change', { bubbles: true }));
        }
        btns.forEach(b => b.addEventListener('click', () => applyMode(b.dataset.mode)));
        updateMeasureUI(els.measureMode.value || 'none');
    })();
    els.clearMarks.addEventListener('click', () => measure.clear());
    els.exportCSV.addEventListener('click', () => measure.exportCSV());

    // === Loader ===
    const loader = initLoader({
        scene, camera, controls, renderer,
        onAfterLoad: function (r) {
            const root = r.root, mesh = r.mesh;

            // BBox & üçgen
            const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            bboxSizeRaw = size.clone();
            try {
                triCountVal = countTriangles(root);
                if (els.triCount) {
                    els.triCount.textContent = triCountVal.toLocaleString('tr-TR');
                    els.triCount.title = els.triCount.textContent;
                }
            } catch (e) { console.warn('Tri count failed:', e); }

            if (els.bboxInfo) {
                const x = fmtLen(bboxSizeRaw.x * metersPerUnit);
                const y = fmtLen(bboxSizeRaw.y * metersPerUnit);
                const z = fmtLen(bboxSizeRaw.z * metersPerUnit);
                els.bboxInfo.textContent = joinDims(x, y, z);
                els.bboxInfo.title = `${x} × ${y} × ${z}`;
            }

            measure.setTargetMesh(mesh);
            renderHudModelInfo();
        }
    });

    // === META / ARAMA ===
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
        getCurrentId: () => currentModelId
    });

    // >>> ARAMA SONUCUNA TIKLANINCA MODELİ YÜKLE <<<
    els.results.addEventListener('meta-pick', (ev) => {
        const rec = ev.detail || {};
        if (rec.modelUrl) {
            currentModelId = rec.modelUrl;
            loader.loadFromURL(rec.modelUrl);
        }
        if (rec.metersPerUnit) setMetersPerUnit(rec.metersPerUnit);
    });

    /* ===================== EKLENDİ: "benzer eserler / arama kartı tıklandığında" ===================== */
    // ui.js tarafı her öğe için window.dispatchEvent(new CustomEvent('select-item', { detail: { item: r } })) atıyor.
    // Burada o olayı yakalayıp aynı yükleme işini yapıyoruz. Diğer özelliklere DOKUNMADAN.
    function applyRecordMetaToPanel(rec) {
        if (!rec) return;
        if (typeof rec.title !== 'undefined') els.title.value = rec.title || '';
        if (typeof rec.category !== 'undefined') els.category.value = rec.category || '';
        if (typeof rec.type !== 'undefined') els.type.value = rec.type || '';
        if (typeof rec.period !== 'undefined') els.period.value = rec.period || '';
        if (typeof rec.material !== 'undefined') els.material.value = rec.material || '';
        if (typeof rec.culture !== 'undefined') els.culture.value = rec.culture || '';
        if (typeof rec.geo !== 'undefined') els.geo.value = rec.geo || '';
        if (typeof rec.abstract !== 'undefined') els.abstract.value = rec.abstract || '';
        if (typeof rec.publications !== 'undefined') {
            let pubs = rec.publications;

            // normalize: array değilse diziye çevir
            if (Array.isArray(pubs)) {
                // olduğu gibi
            } else if (typeof pubs === 'string') {
                // satır bazlı string gelmiş olabilir
                pubs = pubs.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            } else if (pubs == null) {
                pubs = [];
            } else {
                // tek nesne gelmiş olabilir
                pubs = [pubs];
            }

            // her elemanı stringe indirgeme
            const lines = pubs.map(p => {
                if (typeof p === 'string') return p;
                if (p && (p.doi || p.url || p.title)) return p.doi || p.url || p.title;
                try { return JSON.stringify(p); } catch { return ''; }
            }).filter(Boolean);

            els.publications.value = lines.join('\n');
        }
    }
    function resolveModelUrlFromRec(rec) {
        return rec?.modelUrl || rec?.assetUrl || rec?.url || (rec?.files && rec.files.model) || '';
    }
    window.addEventListener('select-item', (e) => {
        const rec = e.detail?.item || e.detail || {};
        const url = resolveModelUrlFromRec(rec);
        if (!url) { console.warn('[select-item] modelUrl bulunamadı', rec); return; }
        currentModelId = url;
        loader.loadFromURL(url);
        if (rec.metersPerUnit) setMetersPerUnit(rec.metersPerUnit);
        applyRecordMetaToPanel(rec);
    });
    /* =================== /EKLENDİ =================== */

    // === KATALOG — yükleme buradan ===
    initCatalog({
        loadBtn: els.loadCatalog,
        selectEl: els.catalogSelect,
        previewEl: els.catalogPreview,                 // yoksa catalog.js zaten no-op
        applyBtn: els.applyMeta,
        setModelUrl: (url) => { /* model input yok; no-op */ },
        loadByUrl: (url) => { currentModelId = url; loader.loadFromURL(url); }, // <<< önemli
        fillMeta: function (rec) {
            els.title.value = rec.title || '';
            els.category.value = rec.category || '';
            els.type.value = rec.type || '';
            els.period.value = rec.period || '';
            els.material.value = rec.material || '';
            els.culture.value = rec.culture || '';
            els.geo.value = rec.geo || '';
            els.abstract.value = rec.abstract || '';
            const pubs = rec.publications || [];
            els.publications.value = pubs.map(p => (p.doi || p.url || p.title)).filter(Boolean).join('\n');
            if (rec.metersPerUnit) setMetersPerUnit(rec.metersPerUnit);
        },
        onLoaded: function (items) { meta.seed(items); },
        fileInput: els.catalogFile,
        loadFileBtn: els.loadCatalogFile
    });

    // Mobil panel toggle
    soft('toggleSidebar')?.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-hidden');
        window.dispatchEvent(new Event('resize'));
    });
}

// DOM hazırsa…
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
