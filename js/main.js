// /js/main.js
// @ts-nocheck
import { initScene, getDomElement, THREE } from './scene.js';
import { initLighting } from './lighting.js';
import { initLoader } from './loader.js';
import { initMeasurements } from './measurements.js';
import { initMetadata } from './metadata.js';
import { initCatalog } from './catalog.js';
import { flash, fmtLen } from './ui.js';
import { initFilters } from './filters.js';
import { grid, requestRender } from './scene.js';

const gridToggle = document.getElementById('gridToggle');

if (gridToggle) {
    // ilk açılışta grid’i duruma göre ayarla
    if (grid) {
        grid.visible = !!gridToggle.checked;
    }

    gridToggle.addEventListener('change', function () {
        if (grid) {
            grid.visible = !!gridToggle.checked;
            requestRender(); // sahneyi hemen yenile
        }
    });
}

function must(id) {
    var el = document.getElementById(id);
    if (!el) { var msg = '[main] DOM id bulunamadı: #' + id; console.error(msg); flash(msg); }
    return el;
}

function countTriangles(object) {
    var tri = 0;
    object.traverse(function (n) {
        if (n.isMesh && n.geometry) {
            var g = n.geometry;
            var cnt = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
            tri += (cnt / 3) | 0;
        }
    });
    return tri | 0;
}

function start() {
    var els = {
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
        measureMode: must('measureMode'),
        measureReadout: must('measureReadout'),
        hudMode: must('hudMode'),
        exportCSV: must('exportCSV'),
        clearMarks: must('clearMarks'),
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
        q: must('q'),
        btnSearch: must('btnSearch'),
        btnSimilar: must('btnSimilar'),
        results: must('results'),
        loadCatalog: must('loadCatalog'),
        catalogSelect: must('catalogSelect'),
        catalogPreview: must('catalogPreview'),
        applyMeta: must('applyMeta'),
        catalogFile: must('catalogFile'),
        loadCatalogFile: must('loadCatalogFile'),
        unitSelect: must('unitSelect'),
        metersPerUnit: must('metersPerUnit'),
        calReal: must('calReal'),
        btnCalFromLast: must('btnCalFromLast')
    };

    // Opsiyonel: Filtre UI elemanları (kartı eklemediyseniz null olabilir)
    var fxSSAO = document.getElementById('fxSsao');
    var fxEdges = document.getElementById('fxEdges');
    var fxQual = document.getElementById('fxQuality');
    var btnRaking = document.getElementById('btnRaking');

    // Birim/ölçek
    var metersPerUnit = 1.0;
    var lastRoot = null;

    function setMetersPerUnit(v) {
        metersPerUnit = Number(v) || 1;
        els.scaleInfo.textContent = metersPerUnit.toFixed(3);
        if (lastRoot) {
            var size = new THREE.Box3().setFromObject(lastRoot).getSize(new THREE.Vector3());
            els.bboxInfo.textContent =
                fmtLen(size.x * metersPerUnit) + ' × ' +
                fmtLen(size.y * metersPerUnit) + ' × ' +
                fmtLen(size.z * metersPerUnit);
        }
    }
    function toMeters(x) { return x * metersPerUnit; }

    // Sahne
    var s = initScene(els.viewer);
    var renderer = s.renderer, scene = s.scene, camera = s.camera, controls = s.controls;
    // Arka plan rengi
    var bgColor = document.getElementById('bgColor');
    if (bgColor) bgColor.addEventListener('input', function () {
        const c = new THREE.Color(bgColor.value);
        renderer.setClearColor(c, 1);
        requestRender(); // <-- EKLE
    });


    // Işık
    var lighting = initLighting({
        scene: scene,
        renderer: renderer,
        azimuth: els.azimuth,
        elevation: els.elevation,
        intensity: els.intensity,
        grayscale: els.grayscale
    });
    // Directional kapalı/açık
    var dirOff = document.getElementById('dirOff');
    if (dirOff) dirOff.addEventListener('change', function () {
        lighting.sun.visible = !dirOff.checked;
        // Eğer intensity ile yönetiyorsan:
        // lighting.sun.intensity = dirOff.checked ? 0 : (Number(els.intensity.value||120)/100);
        requestRender(); // <-- EKLE
    });

    // Filtreler (SSAO, Kenar, FXAA, Curvature)
    var filters = initFilters({ renderer: renderer, scene: scene, camera: camera });

    var fxSSAO = document.getElementById('fxSsao');
    var fxEdges = document.getElementById('fxEdges');
    var fxQual = document.getElementById('fxQuality');
    var fxCurv = document.getElementById('fxCurv');
    var fxCurvAmt = document.getElementById('fxCurvAmt');

    if (fxSSAO) fxSSAO.addEventListener('change', function () { filters.enableSSAO(!!fxSSAO.checked); });
    if (fxEdges) fxEdges.addEventListener('change', function () { filters.enableEdges(!!fxEdges.checked); });
    if (fxQual) fxQual.addEventListener('change', function () { filters.setQuality(fxQual.value); });
    if (fxCurv) fxCurv.addEventListener('change', function () { filters.enableCurvature(!!fxCurv.checked); });
    if (fxCurvAmt) fxCurvAmt.addEventListener('input', function () { filters.setCurvatureStrength((Number(fxCurvAmt.value) || 80) / 100); });

    const btnFxReset = document.getElementById('btnFxReset');
    if (btnFxReset) {
        btnFxReset.addEventListener('click', () => {
            filters.reset();
            const cbSSAO = document.getElementById('fxSsao');
            const cbEdges = document.getElementById('fxEdges');
            if (cbSSAO) cbSSAO.checked = false;
            if (cbEdges) cbEdges.checked = false;
        });
    }

    // Ölçüm
    var measure = initMeasurements({
        scene: scene,
        camera: camera,
        renderer: renderer,
        readoutEl: els.measureReadout,
        hudModeEl: els.hudMode,
        toMeters: toMeters,
        fmtLen: fmtLen
    });
    measure.attachCanvas(getDomElement());
    els.measureMode.addEventListener('change', function () { measure.setMode(els.measureMode.value); });
    els.clearMarks.addEventListener('click', function () { measure.clear(); });
    els.exportCSV.addEventListener('click', function () { measure.exportCSV(); });

    // Loader
    var loader = initLoader({
        scene: scene, camera: camera, controls: controls, renderer: renderer,
        onAfterLoad: function (r) {
            var root = r.root, mesh = r.mesh;
            lastRoot = root;
            measure.setTargetMesh(mesh);

            // BBox ve üçgen sayısı
            var size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
            els.bboxInfo.textContent =
                fmtLen(size.x * metersPerUnit) + ' × ' +
                fmtLen(size.y * metersPerUnit) + ' × ' +
                fmtLen(size.z * metersPerUnit);
            try {
                var tri = countTriangles(root);
                els.triCount.textContent = tri.toLocaleString('tr-TR');
            } catch (e) { console.warn('Tri count failed:', e); }
        }
    });

    // MODEL
    els.loadBtn.addEventListener('click', function () { loader.loadFromURL(els.modelUrl.value); });
    els.loadLocal.addEventListener('click', function () {
        var f = els.localFile.files && els.localFile.files[0];
        if (!f) { flash('Bir .glb/.gltf dosyası seçin.'); return; }
        loader.loadFromFile(f);
    });
    els.screenshotBtn.addEventListener('click', function () {
        var a = document.createElement('a');
        a.href = renderer.domElement.toDataURL('image/png');
        a.download = 'screenshot.png';
        a.click();
    });

    // META / ARAMA
    var meta = initMetadata({
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
            var pubs = (rec.publications || []), lines = [];
            for (var i = 0; i < pubs.length; i++) {
                var p = pubs[i], v = p.doi || p.url || p.title;
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
        var v = els.unitSelect.value;
        var map = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };
        if (v === 'custom') { els.metersPerUnit.focus(); return; }
        els.metersPerUnit.value = map[v];
        setMetersPerUnit(map[v]);
    });
    els.metersPerUnit.addEventListener('change', function () {
        setMetersPerUnit(parseFloat(els.metersPerUnit.value));
    });

    // Kalibrasyon (son ölçüm)
    els.btnCalFromLast.addEventListener('click', function () {
        var lastUnits = measure.getLastLengthUnits();
        var realMeters = parseFloat(els.calReal.value);
        if (!lastUnits || !isFinite(lastUnits)) { flash('Önce bir ölçüm yapın.'); return; }
        if (!realMeters || !isFinite(realMeters)) { flash('Gerçek uzunluğu metre olarak girin.'); return; }
        var mpu = realMeters / lastUnits;
        els.metersPerUnit.value = mpu;
        setMetersPerUnit(mpu);
        flash('Kalibrasyon uygulandı.');
    });

    // Mobile panel toggle
    var toggleBtn = document.getElementById('toggleSidebar');
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
