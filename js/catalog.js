// /js/catalog.js
// @ts-nocheck

import { flash } from './ui.js';

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item';
}

async function tryFetch(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    const data = await r.json();
    return parseCatalog(data);
}

function parseCatalog(src) {
    let items;
    if (Array.isArray(src)) items = src;
    else if (Array.isArray(src?.items)) items = src.items;
    else if (Array.isArray(src?.catalog?.items)) items = src.catalog.items;
    else throw new Error('Geçersiz format: items[] yok.');

    // normalize
    items = items.map((rec, i) => {
        const id = rec.id || rec.slug || slugify(rec.title) || `item-${i + 1}`;
        return {
            id,
            title: rec.title || `Kayıt #${i + 1}`,
            modelUrl: rec.modelUrl || rec.url || '',
            metersPerUnit: (typeof rec.metersPerUnit === 'number' ? rec.metersPerUnit : 1),

            category: rec.category || '',
            type: rec.type || '',
            period: rec.period || '',
            material: rec.material || '',
            culture: rec.culture || '',
            geo: rec.geo || '',
            abstract: rec.abstract || '',
            publications: Array.isArray(rec.publications) ? rec.publications : [],

            // serbest diğer alanlar da korunur
            ...rec
        };
    });

    return items;
}

function bindPreview(selectEl, previewEl, items) {
    if (!selectEl || !previewEl) return;

    function render() {
        const id = selectEl.value;
        const rec = items.find(x => x.id === id);
        if (!rec) { previewEl.textContent = ''; return; }

        const pubs = (rec.publications || [])
            .map(p => (p.doi || p.url || p.title))
            .filter(Boolean)
            .join('<br>');

        previewEl.innerHTML = `
      <div style="font-size:12px; line-height:1.4">
        <div><b>${rec.title}</b></div>
        <div>${rec.category || ''} ${rec.type ? '• ' + rec.type : ''}</div>
        <div>${rec.period || ''} ${rec.material ? '• ' + rec.material : ''}</div>
        <div>${rec.culture || ''} ${rec.geo ? '• ' + rec.geo : ''}</div>
        ${rec.abstract ? `<div style="margin-top:6px">${rec.abstract}</div>` : ''}
        ${pubs ? `<div style="margin-top:6px;color:#9aa"><i>${pubs}</i></div>` : ''}
        ${rec.modelUrl ? `<div style="margin-top:6px;color:#9aa">modelUrl: <code>${rec.modelUrl}</code></div>` : ''}
      </div>
    `;
    }

    selectEl.addEventListener('change', render);
    render();
}

export function initCatalog({
    loadBtn, selectEl, previewEl, applyBtn,
    setModelUrl, loadByUrl, fillMeta, onLoaded,
    fileInput, loadFileBtn
}) {
    let items = [];

    async function loadCatalog() {
        const candidates = [
            './catalog.json',
            './data/catalog.json',
            './js/catalog.json'
        ];
        let lastErr = null;

        for (const u of candidates) {
            try {
                const it = await tryFetch(u);
                items = it;
                break;
            } catch (e) {
                lastErr = e;
            }
        }

        if (!items.length) {
            console.error('[catalog] Yüklenemedi:', lastErr);
            flash('catalog.json bulunamadı. Proje köküne catalog.json koyun.');
            return;
        }

        // select doldur
        if (selectEl) {
            selectEl.innerHTML = '<option value="">— Kayıt seç —</option>' +
                items.map(r => `<option value="${r.id}">${r.title}</option>`).join('');
        }

        if (onLoaded) onLoaded(items);
        bindPreview(selectEl, previewEl, items);
        flash(`Katalog yüklendi (${items.length} kayıt).`);
    }

    async function applySelected() {
        if (!selectEl) return;
        const id = selectEl.value;
        const rec = items.find(x => x.id === id);
        if (!rec) { flash('Önce bir kayıt seçin.'); return; }

        if (fillMeta) fillMeta(rec);
        if (rec.modelUrl && (loadByUrl || setModelUrl)) {
            if (setModelUrl) setModelUrl(rec.modelUrl);
            if (loadByUrl) loadByUrl(rec.modelUrl);
        }
        flash('Kayıt uygulandı.');
    }

    async function loadFromFile() {
        if (!fileInput?.files?.length) { flash('Bir JSON dosyası seçin.'); return; }
        try {
            const f = fileInput.files[0];
            const text = await f.text();
            const data = JSON.parse(text);
            items = parseCatalog(data);

            if (selectEl) {
                selectEl.innerHTML = '<option value="">— Kayıt seç —</option>' +
                    items.map(r => `<option value="${r.id}">${r.title}</option>`).join('');
            }
            if (onLoaded) onLoaded(items);
            bindPreview(selectEl, previewEl, items);
            flash(`Katalog dosyadan yüklendi (${items.length}).`);
        } catch (e) {
            console.error(e);
            flash('Geçersiz katalog dosyası.');
        }
    }

    loadBtn?.addEventListener('click', loadCatalog);
    applyBtn?.addEventListener('click', applySelected);
    loadFileBtn?.addEventListener('click', loadFromFile);
}
