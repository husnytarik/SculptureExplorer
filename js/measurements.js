// @ts-nocheck
import { THREE, requestRender } from './scene.js';
import { getCurrentMesh } from './loader.js';
import { flash } from './ui.js';
import { ensureGraph, surfacePath, surfacePolyline } from './geodesic.js';

export function initMeasurements({ scene, camera, renderer, readoutEl, hudModeEl, toMeters, fmtLen }) {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let marks = [];
    let overlays = [];
    let mode = 'none';
    let targetMesh = null;
    let lastLenUnits = null;

    function setTargetMesh(mesh) {
        targetMesh = mesh; clear();
        if (mesh) {
            flash('Yüzey grafiği hazırlanıyor…');
            ensureGraph(mesh).then(function () { flash('Yüzey grafiği hazır.'); });
        }
    }

    // ---- Readout yardımcı (overlay + panel uyumlu) ----
    // 1) main.js içindeki window.updateReadout varsa onu kullanır (overlay + panel birlikte güncellenir)
    // 2) Yoksa initMeasurements'tan gelen readoutEl'e yazar
    // 3) O da yoksa id fallback: measureReadoutOverlay -> measureReadout (legacy) -> measureReadoutPanel
    function updateReadout(html) {
        if (typeof window !== 'undefined' && typeof window.updateReadout === 'function') {
            try { window.updateReadout(html); } catch (e) { }
            return;
        }
        if (readoutEl && typeof readoutEl.innerHTML !== 'undefined') {
            readoutEl.innerHTML = html;
            return;
        }
        const el =
            document.getElementById('measureReadoutOverlay') ||
            document.getElementById('measureReadout') ||
            document.getElementById('measureReadoutPanel');
        if (el) el.innerHTML = html;
    }

    function clear() {
        marks = [];
        for (let i = 0; i < overlays.length; i++) scene.remove(overlays[i]);
        overlays = [];
        updateReadout('<span class="muted">Ölçüm</span>');
        // eskiden: hudModeEl.textContent = 'Mod: ...'
        // Artık HUD'a ölçüm modu yazmıyoruz; model bilgileri main.js'den gelir.
        requestRender();
    }

    function labelFor(m) {
        if (m === 'distance') return 'Mesafe (2 nokta)';
        if (m === 'polyline') return 'Yol Uzunluğu (çok nokta)';
        if (m === 'surface2') return 'Yüzey Mesafesi (2 nokta)';
        if (m === 'surfacePath') return 'Yüzey Yol (çok nokta)';
        if (m === 'girth') return 'Kesit Çevresi (β)';
        return 'Gezinti';
    }

    function setMode(m) { mode = m; clear(); }

    function addMarker(pos, color, scale) {
        if (color === undefined) color = 0x60a5fa;
        if (scale === undefined) scale = 0.01;
        const g = new THREE.SphereGeometry(scale, 16, 12);
        const m = new THREE.MeshBasicMaterial({ color: color });
        const s = new THREE.Mesh(g, m);
        s.position.copy(pos);
        scene.add(s);
        overlays.push(s);
        return s;
    }

    function addLine(points, color) {
        if (color === undefined) color = 0x93c5fd;
        const g = new THREE.BufferGeometry().setFromPoints(points);
        const m = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
        const l = new THREE.Line(g, m);
        scene.add(l);
        overlays.push(l);
        return l;
    }

    function screenToNDC(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickPoint(event) {
        const mesh = targetMesh || getCurrentMesh();
        if (!mesh) return null;
        screenToNDC(event);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(mesh, true)[0];
        return hit ? hit.point.clone() : null;
    }

    async function onClick(e) {
        if (mode === 'none') return;
        const p = pickPoint(e); if (!p) return;
        const isCenter = mode === 'girth' && marks.length === 0;
        marks.push({ point: p, type: isCenter ? 'center' : 'pick' });
        addMarker(p, isCenter ? 0x34d399 : 0x60a5fa, isCenter ? 0.012 : 0.01);

        if (mode === 'distance' && marks.length === 2) doDistance();
        else if (mode === 'polyline' && marks.length >= 2) doPolyline();
        else if (mode === 'surface2' && marks.length === 2) await doSurface2();
        else if (mode === 'surfacePath' && marks.length >= 2) await doSurfacePath();
        else if (mode === 'girth' && marks.length >= 1) doGirth();
        requestRender();
    }
    function onContext(e) { e.preventDefault(); clear(); }

    function doDistance() {
        if (marks.length < 2) return;
        const a = marks[0].point, b = marks[1].point;
        addLine([a, b]);
        const d = a.distanceTo(b);
        lastLenUnits = d;
        updateReadout('<div><b>Mesafe:</b> ' + fmtLen(toMeters(d)) + '</div>');
    }

    function doPolyline() {
        if (marks.length < 2) return;
        const pts = []; for (let i = 0; i < marks.length; i++) pts.push(marks[i].point);
        addLine(pts);
        let len = 0; for (let i = 0; i < pts.length - 1; i++) len += pts[i].distanceTo(pts[i + 1]);
        lastLenUnits = len;
        updateReadout('<div><b>Yol Uzunluğu:</b> ' + fmtLen(toMeters(len)) + '</div>');
    }

    async function doSurface2() {
        const mesh = targetMesh || getCurrentMesh(); if (!mesh) return;
        const A = marks[0].point, B = marks[1].point;
        const sp = await surfacePath(mesh, A, B);
        if (sp.points && sp.points.length > 1) {
            addLine(sp.points, 0x22d3ee);
            lastLenUnits = sp.length;
            updateReadout('<div><b>Yüzey Mesafesi:</b> ' + fmtLen(toMeters(sp.length)) + '</div>');
        } else {
            updateReadout('<span class="muted">Yüzey yolu bulunamadı.</span>');
        }
    }

    async function doSurfacePath() {
        const mesh = targetMesh || getCurrentMesh(); if (!mesh) return;
        if (marks.length < 2) return;
        const pts = []; for (let i = 0; i < marks.length; i++) pts.push(marks[i].point);
        const sp = await surfacePolyline(mesh, pts);
        if (sp.points && sp.points.length > 1) {
            addLine(sp.points, 0xa78bfa);
            lastLenUnits = sp.length;
            updateReadout('<div><b>Yüzey Yol Uzunluğu:</b> ' + fmtLen(toMeters(sp.length)) + '</div>');
        } else {
            updateReadout('<span class="muted">Yüzey yolu bulunamadı.</span>');
        }
    }

    function estimateLocalRadius(center, viewDir) {
        const tmp = Math.abs(viewDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const u = new THREE.Vector3().crossVectors(viewDir, tmp).normalize();
        const v = new THREE.Vector3().crossVectors(viewDir, u).normalize();
        const dirs = [u, u.clone().negate(), v, v.clone().negate()], ds = [];
        for (let j = 0; j < dirs.length; j++) {
            const d = dirs[j];
            raycaster.set(new THREE.Vector3().copy(center).addScaledVector(d, 0.3), d.clone().negate());
            const hit = raycaster.intersectObject(targetMesh || getCurrentMesh(), true)[0];
            if (hit) ds.push(hit.point.distanceTo(center));
        }
        return ds.length ? ds.reduce(function (a, b) { return a + b; }, 0) / ds.length : 0.05;
    }

    function doGirth() {
        if (marks.length < 1) return;
        const center = marks[0].point;
        const viewDir = new THREE.Vector3().subVectors(center, camera.position).normalize();
        const tmp = Math.abs(viewDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const u = new THREE.Vector3().crossVectors(viewDir, tmp).normalize();
        const v = new THREE.Vector3().crossVectors(viewDir, u).normalize();
        const N = 96, r0 = estimateLocalRadius(center, viewDir) * 3; const pts = [];
        for (let i = 0; i < N; i++) {
            const ang = i / N * Math.PI * 2;
            const dirFlat = new THREE.Vector3().copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
            const start = new THREE.Vector3().copy(center).addScaledVector(dirFlat, r0);
            const dir = new THREE.Vector3().subVectors(center, start).normalize();
            raycaster.set(start, dir);
            const hit = raycaster.intersectObject(targetMesh || getCurrentMesh(), true)[0];
            if (hit) pts.push(hit.point.clone());
        }
        if (pts.length < 8) { updateReadout('<span class="muted">Çevre hesaplanamadı (yetersiz örnek).</span>'); return; }
        pts.sort(function (A, B) {
            const a = Math.atan2(new THREE.Vector3().subVectors(A, center).dot(v), new THREE.Vector3().subVectors(A, center).dot(u));
            const b = Math.atan2(new THREE.Vector3().subVectors(B, center).dot(v), new THREE.Vector3().subVectors(B, center).dot(u));
            return a - b;
        });
        const poly = pts.slice(); poly.push(pts[0]);
        addLine(poly, 0x22d3ee);
        let peri = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; peri += p.distanceTo(q); }
        lastLenUnits = peri;
        updateReadout('<div><b>Kesit Çevresi (β):</b> ' + fmtLen(toMeters(peri)) + '</div>');
    }

    function attachCanvas(canvas) {
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('contextmenu', onContext);
    }

    function exportCSV() {
        if (!marks.length) { flash('Önce ölçüm yapın.'); return; }
        const rows = [['idx', 'x', 'y', 'z', 'type']];
        for (let i = 0; i < marks.length; i++) {
            const m = marks[i];
            rows.push([i, m.point.x, m.point.y, m.point.z, m.type]);
        }
        const csv = rows.map(function (r) { return r.join(','); }).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'measurement_points.csv';
        a.click();
    }

    function getLastLengthUnits() { return lastLenUnits; }

    return { setMode, clear, attachCanvas, exportCSV, setTargetMesh, getLastLengthUnits };
}
