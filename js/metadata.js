// /js/metadata.js
// @ts-nocheck
import { renderResults, escapeHTML } from './ui.js';

export function initMetadata({ inputs, saveBtn, resultsEl, queryInput, btnSearch, btnSimilar, getCurrentId }) {
    const DB = [];

    function applyRecord(rec) {
        // Formu doldur
        Object.entries(inputs || {}).forEach(([k, el]) => {
            if (!el) return;
            el.value = (rec?.[k] ?? '');
        });
        // İsteyen main.js yakalasın (model URL varsa oradan yükleyebilir)
        resultsEl?.dispatchEvent(new CustomEvent('meta-pick', { detail: rec }));
    }

    // Formu kaydet -> DB'ye ekle (CASE KORUNUR)
    function save() {
        const rec = Object.fromEntries(
            Object.entries(inputs).map(([k, el]) => [k, (el.value || '').trim()])
        );
        rec.id = getCurrentId ? getCurrentId() : ('id-' + Date.now());
        DB.push(rec);
        renderResults(resultsEl, DB, { onPick: applyRecord });
    }

    // Basit arama (case-insensitive)
    function search(q) {
        const terms = (q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        return DB.filter(rec =>
            terms.every(t =>
                Object.values(rec).some(v => (v != null) && (v + '').toLowerCase().includes(t))
            )
        );
    }

    function tokens(s) {
        return String(s || '').toLowerCase().split(/\W+/).filter(Boolean);
    }

    function jaccard(a, b) {
        const A = new Set(a), B = new Set(b);
        const inter = [...A].filter(x => B.has(x)).length;
        const uni = new Set([...A, ...B]).size;
        return uni ? inter / uni : 0;
    }

    function similarTo(idOrText) {
        const base = typeof idOrText === 'string'
            ? DB.find(r => r.id === idOrText) || { title: idOrText }
            : { title: '' };
        const tok = tokens(base.title);
        const scored = DB.map(r => ({ r, s: jaccard(tok, tokens(r.title)) }));
        scored.sort((a, b) => b.s - a.s);
        return scored.slice(0, 20).map(x => x.r);
    }

    btnSearch?.addEventListener('click', () => {
        const list = search(queryInput?.value);
        renderResults(resultsEl, list, { onPick: applyRecord });
    });

    btnSimilar?.addEventListener('click', () => {
        const id = getCurrentId?.();
        const list = similarTo(id || (queryInput?.value || ''));
        renderResults(resultsEl, list, { onPick: applyRecord });
    });

    saveBtn?.addEventListener('click', save);

    // Katalogtan gelen kayıtları DB'ye koy (CASE KORUNUR)
    function seed(items) {
        const norm = (items || []).map(rec => ({
            id: rec.id || rec.url || ('rec-' + Math.random().toString(36).slice(2)),
            title: rec.title || '',
            category: rec.category || '',
            type: rec.type || '',
            period: rec.period || '',
            material: rec.material || '',
            culture: rec.culture || '',
            geo: rec.geo || '',
            abstract: rec.abstract || '',
            publications: (rec.publications || []).map(p => p.doi || p.url || p.title || '').join('\n'),
            modelUrl: rec.url || rec.modelUrl || ''
        }));
        DB.splice(0, DB.length, ...norm);
        renderResults(resultsEl, DB, { onPick: applyRecord });
    }

    return { seed, save, search, similarTo };
}
