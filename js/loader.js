// /js/loader.js
// @ts-nocheck
import { THREE, requestRender } from './scene.js';
import * as UI from './ui.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// flash güvenli fallback
const flash = UI.flash || ((msg) => console.log('[flash]', msg));

let loader, ctx = {}, currentModel = null, currentMesh = null;



function disposeObject3D(root) {
    if (!root) return;
    root.traverse(obj => {
        if (obj.isMesh) {
            if (obj.geometry) obj.geometry.dispose?.();
            // Material tekil veya dizi olabilir
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
                if (!m) return;
                // Üzerindeki tüm texture alanlarını dispose etmeye çalış
                Object.keys(m).forEach(k => {
                    const v = m[k];
                    if (v && v.isTexture) v.dispose?.();
                });
                m.dispose?.();
            });
        }
    });
}


export function initLoader({ scene, camera, controls, renderer, onAfterLoad }) {
    const gltf = new GLTFLoader();

    let currentRoot = null;      // sahnedeki aktif kök
    let loadTicket = 0;          // artan sayaç (en son yükleme bileti)
    let isLoading = false;       // butonları vs. kilitlemek istersen kullan

    async function loadFromURL(url) {
        // Yeni bir bilet üret
        const myTicket = ++loadTicket;
        isLoading = true;

        try {
            // GLB/GLTF asenkron yükleme
            const res = await gltf.loadAsync(url);

            // Bu arada başka bir yükleme başlatılmışsa, BEN ESKİYİM → görmezden gel
            if (myTicket !== loadTicket) {
                // Yükledim ama artık geçersiz, memory sızıntısı olmasın diye dispose et
                disposeObject3D(res.scene);
                return;
            }

            // Sahnedeki eski modeli temizle
            if (currentRoot) {
                scene.remove(currentRoot);
                disposeObject3D(currentRoot);
                currentRoot = null;
            }

            // Yeni kökü sahneye ekle
            const root = res.scene;
            scene.add(root);
            currentRoot = root;

            // Kamera/controls uyarlamaların varsa burada
            controls?.update?.();

            // initLoader'a verilen geri çağrı
            if (typeof onAfterLoad === 'function') {
                // Bazı kodlarında "mesh" bekleniyorsa bir tane candidate seçelim:
                let mainMesh = null;
                root.traverse(o => { if (!mainMesh && o.isMesh) mainMesh = o; });
                onAfterLoad({ root, mesh: mainMesh, url });
            }
        } catch (err) {
            // Hata durumunda sadece en güncel yükleme için rapor ver
            if (myTicket === loadTicket) {
                console.error('[loader] Yükleme hatası:', err);
            }
        } finally {
            // Yalnızca en güncel iş için loading=false
            if (myTicket === loadTicket) {
                isLoading = false;
            }
        }
    }


    loader = new GLTFLoader();
    ctx.scene = scene;
    ctx.camera = camera;
    ctx.controls = controls;
    ctx.renderer = renderer;
    ctx.onAfterLoad = onAfterLoad;
    return {
        loadFromURL,
        get isLoading() { return isLoading; },
        get currentRoot() { return currentRoot; }
    };
}

export async function loadFromURL(url) {
    if (!url) { flash('URL boş.'); return; }
    try {
        await load(url);
    } catch (e) { flash('Model yüklenemedi.'); console.error(e); }
}

export async function loadFromFile(file) {
    try {
        const url = URL.createObjectURL(file);
        await load(url);
        // Dosya URL’sini serbest bırak
        setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) { flash('Dosya yüklenemedi.'); console.error(e); }
}

async function load(url) {
    // Önceki modeli temizle
    if (currentModel) {
        ctx.scene.remove(currentModel.scene || currentModel);
        currentModel = null;
        currentMesh = null;
    }

    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || gltf.scenes?.[0];

    // Mesh’lerde gölge ve doubleSide
    root.traverse(n => {
        if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
            if (n.material) n.material.side = THREE.DoubleSide;
        }
    });

    ctx.scene.add(root);
    currentModel = gltf;

    // En büyük mesh’i hedef seç
    let largest = null, area = -Infinity;
    root.traverse(n => {
        if (n.isMesh) {
            const b = new THREE.Box3().setFromObject(n);
            const s = new THREE.Vector3(); b.getSize(s);
            const a = s.x * s.y * s.z;
            if (a > area) { area = a; largest = n; }
        }
    });
    currentMesh = largest;

    // Kamerayı yerleştir
    fitCameraToObject(root, ctx.camera, ctx.controls, 1.25);

    requestRender();
    ctx.onAfterLoad && ctx.onAfterLoad({ gltf, root, mesh: currentMesh });

    // (opsiyonel) üçgen sayısını güncelle
    const triEl = document.getElementById('triCount');
    if (triEl) triEl.textContent = countTriangles(root).toLocaleString('tr-TR');
}

export function fitCameraToObject(object, camera, controls, offset = 1.2) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const maxSize = Math.max(size.x, size.y, size.z);
    const fitDist = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));

    camera.position.copy(center).add(
        new THREE.Vector3(fitDist * offset, fitDist * offset * 0.6, fitDist * offset)
    );
    controls.target.copy(center);
    controls.update();
}

export function countTriangles(object) {
    let tri = 0;
    object.traverse(n => {
        if (n.isMesh && n.geometry) {
            const idx = n.geometry.index;
            const pos = n.geometry.attributes?.position;
            const cnt = idx ? idx.count : (pos ? pos.count : 0);
            tri += (cnt / 3) | 0;
        }
    });
    return tri | 0;
}


export function getCurrentMesh() { return currentMesh; }
export function getCurrentModel() { return currentModel; }
