// @ts-nocheck
import { badge, escapeHTML, flash } from './ui.js';

export function initCatalog({ loadBtn, selectEl, previewEl, applyBtn, setModelUrl, loadByUrl, fillMeta, onLoaded, fileInput, loadFileBtn }) {
    let CATALOG = null;

    async function tryFetch(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        const text = await res.text();
        return parseCatalog(text, url);
    }

    function parseCatalog(text, originLabel) {
        let data;
        try { data = JSON.parse(text); }
        catch (e) { flash('catalog.json parse hatası: ' + e.message); throw e; }
        if (!data || !Array.isArray(data.items)) { throw new Error('Geçersiz format: items[] yok.'); }
        CATALOG = data;

        let opts = '<option value=\"\">— Kayıt seç —</option>';
        for (let i = 0; i < CATALOG.items.length; i++) {
            const it = CATALOG.items[i];
            const label = escapeHTML(it.title || ('Kayıt ' + (i + 1)));
            opts += '<option value=\"' + i + '\">' + label + '</option>';
        }
        selectEl.innerHTML = opts;

        flash('Katalog yüklendi (' + originLabel + '): ' + CATALOG.items.length + ' kayıt');
        if (onLoaded) onLoaded(CATALOG.items);
        return CATALOG;
    }

    async function loadCatalog() {
        try {
            await tryFetch('./catalog.json');
        } catch (e1) {
            try { await tryFetch('/catalog.json'); }
            catch (e2) {
                flash('catalog.json bulunamadı. (./ veya /)\nDetay: ' + e2.message);
                console.error(e1, e2);
            }
        }
    }

    function renderPreview() {
        const idx = +selectEl.value;
        if (!CATALOG || isNaN(idx)) { previewEl.textContent = ''; return; }
        const it = CATALOG.items[idx];

        const tags =
            (badge(it.category) || '') + ' ' +
            (badge(it.type) || '') + ' ' +
            (badge(it.period) || '') + ' ' +
            (badge(it.material) || '') + ' ' +
            (badge(it.culture) || '') + ' ' +
            (badge(it.geo) || '');

        const abs = escapeHTML((it.abstract || '').slice(0, 140)) + '…';
        previewEl.innerHTML = tags + '<br><span class=\"muted\">' + abs + '</span>';
    }

    function applySelected() {
        const idx = +selectEl.value; if (!CATALOG || isNaN(idx)) { flash('Kayıt seçiniz.'); return; }
        const it = CATALOG.items[idx];
        if (setModelUrl) setModelUrl(it.file);
        if (loadByUrl) loadByUrl(it.file);
        if (fillMeta) fillMeta(it);
    }

    function loadCatalogFromFile() {
        const f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) { flash('Bir .json dosyası seçin.'); return; }
        const reader = new FileReader();
        reader.onload = function () {
            try { parseCatalog(reader.result, f.name); }
            catch (e) { console.error(e); }
        };
        reader.readAsText(f, 'utf-8');
    }

    loadBtn.addEventListener('click', loadCatalog);
    if (loadFileBtn) loadFileBtn.addEventListener('click', loadCatalogFromFile);
    if (fileInput) fileInput.addEventListener('change', loadCatalogFromFile);
    selectEl.addEventListener('change', renderPreview);
    applyBtn.addEventListener('click', applySelected);
}
