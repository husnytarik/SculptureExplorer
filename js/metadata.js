import { renderResults } from './ui.js';


const DB = [];


export function initMetadata({ inputs, saveBtn, resultsEl, queryInput, btnSearch, btnSimilar, getCurrentId }) {
    function save() {
        const id = (getCurrentId() || '').trim();
        const rec = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, (el.value || '').trim().toLowerCase()]));
        rec.id = id;
        const i = DB.findIndex(d => d.id === id);
        if (i >= 0) DB[i] = { ...DB[i], ...rec }; else DB.push(rec);
        renderResults(resultsEl, DB.slice(-10));
    }
    function tokens(s) { return (s || '').toLowerCase().split(/[^a-z0-9çğıöşü]+/i).filter(Boolean); }
    function search(q) {
        const terms = tokens(q);
        if (!terms.length) return DB.slice(0, 10);
        return DB.filter(rec => terms.every(t => Object.values(rec).some(v => (v || '').includes && v.includes(t))));
    }
    function jaccard(a, b) {
        const SA = new Set(tokens(a));
        const SB = new Set(tokens(b));
        const inter = new Set([...SA].filter(x => SB.has(x))).size;
        const uni = new Set([...SA, ...SB]).size || 1;
        return inter / uni;
    }
    function similarToCurrent() {
        const id = (getCurrentId() || '').trim();
        const me = DB.find(d => d.id === id); if (!me) return [];
        const key = ['category', 'type', 'period', 'material', 'culture', 'geo'].map(k => me[k]).join(' ');
        return DB.filter(d => d.id !== id)
            .map(d => ({ rec: d, score: jaccard(key, ['category', 'type', 'period', 'material', 'culture', 'geo'].map(k => d[k]).join(' ')) }))
            .sort((a, b) => b.score - a.score).slice(0, 10).map(x => x.rec);
    }


    // wire
    saveBtn.addEventListener('click', save);
    btnSearch.addEventListener('click', () => renderResults(resultsEl, search(queryInput.value)));
    btnSimilar.addEventListener('click', () => renderResults(resultsEl, similarToCurrent()));


    return {
        seed(items) {
            for (const it of items || []) {
                DB.push({
                    id: it.file || it.title,
                    title: (it.title || '').toLowerCase(),
                    category: (it.category || '').toLowerCase(),
                    type: (it.type || '').toLowerCase(),
                    period: (it.period || '').toLowerCase(),
                    material: (it.material || '').toLowerCase(),
                    culture: (it.culture || '').toLowerCase(),
                    geo: (it.geo || '').toLowerCase(),
                    abstract: (it.abstract || '').toLowerCase(),
                });
            }
            renderResults(resultsEl, DB.slice(-10));
        },
        getDB() { return DB; }
    };
}