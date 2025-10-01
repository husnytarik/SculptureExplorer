// /js/ui.js  — v2 (tek export seti)
// @ts-nocheck
export function flash(html) {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.style.position = 'fixed';
    pill.style.right = '12px';
    pill.style.bottom = '12px';
    pill.innerHTML = html;
    document.body.appendChild(pill);
    setTimeout(function () { pill.remove(); }, 2600);
}

export function escapeHTML(s) {
    return (s || '').replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

export function badge(s) {
    s = (s || '').trim();
    return s ? '<span class="badge">' + escapeHTML(s) + '</span>' : '';
}

export function fmt(n) {
    return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

// metre girdisini uygun birimle yazar
export function fmtLen(m) {
    var abs = Math.abs(m);
    function trim(x, d) { return Number(x.toFixed(d)).toString(); }
    if (abs >= 1) return trim(m, 3) + ' m';
    if (abs >= 0.01) return trim(m * 100, 2) + ' cm';
    return trim(m * 1000, 1) + ' mm';
}

export function renderResults(container, list) {
    container.innerHTML = '';
    if (!list || !list.length) {
        container.innerHTML = '<span class="muted">Sonuç yok.</span>';
        return;
    }
    for (var i = 0; i < list.length; i++) {
        const r = list[i];
        var el = document.createElement('div'); el.className = 'item';
        var html = '<h4>' + escapeHTML(r.title || '(adsız)') + '</h4>' +
            '<div class="row" style="flex-wrap:wrap; gap:6px">' +
            (badge(r.category) || '') + ' ' + (badge(r.type) || '') + ' ' + (badge(r.period) || '') + ' ' +
            (badge(r.material) || '') + ' ' + (badge(r.culture) || '') + ' ' + (badge(r.geo) || '') +
            '</div>' +
            '<div class="sep"></div>' +
            '<div class="muted">' + escapeHTML(((r.abstract || '') + '').slice(0, 120)) + '…</div>';
        el.innerHTML = html;
        container.appendChild(el);
        el.dataset.itemId = r.id || r.uid || r.key || '';
        el.style.cursor = 'pointer';
        el.tabIndex = 0;              // klavye ile de seçilebilir olsun
        el.setAttribute('role', 'button');

        el.addEventListener('click', function () {
            // Tüm item objesini de detayda yolluyoruz ki gerekirse URL, başlık vs. oradan okunsun
            window.dispatchEvent(new CustomEvent('select-item', { detail: { item: r } }));
        });

        // (İsteğe bağlı: klavye desteği)
        el.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                el.click();
            }
        });
    }
}

/* --- EK: default export (mevcut named export'lara dokunmadan) --- */
export default { flash, escapeHTML, badge, fmt, fmtLen, renderResults };
