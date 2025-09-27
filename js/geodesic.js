// @ts-nocheck
import { THREE } from './scene.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function buildGraph(mesh) {
    let geom = mesh.geometry.clone();
    try { geom = BufferGeometryUtils.mergeVertices(geom, 1e-4); } catch (e) { }

    const pos = geom.attributes.position;
    const count = pos.count;

    let index = geom.index ? geom.index.array : null;
    if (!index) {
        index = new (count > 65535 ? Uint32Array : Uint16Array)(count);
        for (let i = 0; i < count; i++) index[i] = i;
    }

    const world = new Array(count);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
        p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        world[i] = mesh.localToWorld(p.clone());
    }

    const adj = new Array(count); for (let i = 0; i < count; i++) adj[i] = [];
    function addEdge(a, b) {
        if (a === b) return;
        const w = world[a].distanceTo(world[b]);
        adj[a].push({ to: b, w }); adj[b].push({ to: a, w });
    }
    for (let i = 0; i < index.length; i += 3) {
        const a = index[i], b = index[i + 1], c = index[i + 2];
        addEdge(a, b); addEdge(b, c); addEdge(c, a);
    }
    for (let i = 0; i < adj.length; i++) {
        const seen = new Set();
        adj[i] = adj[i].filter(function (e) { if (seen.has(e.to)) return false; seen.add(e.to); return true; });
    }

    mesh.userData.__geodesic = { world: world, adj: adj };
    return mesh.userData.__geodesic;
}

export async function ensureGraph(mesh) {
    if (mesh.userData.__geodesic) return mesh.userData.__geodesic;
    await new Promise(function (r) { setTimeout(r, 0); });
    return buildGraph(mesh);
}

function nearestVertex(mesh, pointWorld) {
    const G = mesh.userData.__geodesic || buildGraph(mesh);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < G.world.length; i++) {
        const d = G.world[i].distanceToSquared(pointWorld);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

class MinHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    push(x) { this.a.push(x); this._up(this.a.length - 1); }
    pop() {
        const a = this.a; const top = a[0]; const last = a.pop();
        if (a.length) { a[0] = last; this._down(0); }
        return top;
    }
    _up(i) {
        const a = this.a;
        while (i) {
            const p = (i - 1) >> 1;
            if (a[p].d <= a[i].d) break;
            const t = a[p]; a[p] = a[i]; a[i] = t;
            i = p;
        }
    }
    _down(i) {
        const a = this.a;
        for (; ;) {
            const l = i * 2 + 1, r = l + 1; let s = i;
            if (l < a.length && a[l].d < a[s].d) s = l;
            if (r < a.length && a[r].d < a[s].d) s = r;
            if (s === i) break;
            const t = a[i]; a[i] = a[s]; a[s] = t;
            i = s;
        }
    }
}

function shortestPathIndices(adj, start, goal) {
    const N = adj.length;
    const dist = new Float64Array(N); dist.fill(Infinity); dist[start] = 0;
    const prev = new Int32Array(N); prev.fill(-1);
    const heap = new MinHeap(); heap.push({ i: start, d: 0 });
    while (heap.size()) {
        const top = heap.pop();
        const i = top.i, d = top.d;
        if (d !== dist[i]) continue;
        if (i === goal) break;
        const row = adj[i];
        for (let k = 0; k < row.length; k++) {
            const e = row[k];
            const nd = d + e.w;
            if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = i; heap.push({ i: e.to, d: nd }); }
        }
    }
    if (prev[goal] === -1) return { indices: [], length: Infinity };
    const path = []; let u = goal; while (u !== -1) { path.push(u); u = prev[u]; } path.reverse();
    return { indices: path, length: dist[goal] };
}

export async function surfacePath(mesh, A, B) {
    await ensureGraph(mesh);
    const s = nearestVertex(mesh, A), t = nearestVertex(mesh, B);
    const sp = shortestPathIndices(mesh.userData.__geodesic.adj, s, t);
    const pts = [];
    for (let i = 0; i < sp.indices.length; i++) {
        const idx = sp.indices[i];
        pts.push(mesh.userData.__geodesic.world[idx]);
    }
    return { points: pts, length: sp.length };
}

export async function surfacePolyline(mesh, pointsWorld) {
    await ensureGraph(mesh);
    let allPts = []; let total = 0;
    for (let i = 0; i < pointsWorld.length - 1; i++) {
        const seg = await surfacePath(mesh, pointsWorld[i], pointsWorld[i + 1]);
        const p = seg.points;
        if (i > 0 && p.length) p.shift();
        allPts = allPts.concat(p);
        total += seg.length;
    }
    return { points: allPts, length: total };
}
