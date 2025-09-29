// /js/postprocessing/NormalPass.js
import {
    Color,
    MeshNormalMaterial,
    Scene,
    WebGLRenderTarget,
    LinearFilter,
    RGBAFormat
} from 'three';

class NormalPass {

    constructor(scene, camera, options = {}) {

        this.scene = scene;
        this.camera = camera;
        this.enabled = true;
        this.clear = true;
        this.needsSwap = false;

        const normalMaterial = new MeshNormalMaterial();
        normalMaterial.side = options.side || 0;

        this.normalScene = new Scene();
        this.normalScene.background = new Color(0x000000);
        this.normalMaterial = normalMaterial;

        const width = options.width || window.innerWidth;
        const height = options.height || window.innerHeight;

        this.renderTarget = new WebGLRenderTarget(width, height, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat
        });

        this.renderTarget.texture.name = 'NormalPass.rt';

    }

    render(renderer) {
        const oldOverride = this.scene.overrideMaterial;
        this.scene.overrideMaterial = this.normalMaterial;
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(this.scene, this.camera);
        this.scene.overrideMaterial = oldOverride;
    }

    setSize(width, height) {
        this.renderTarget.setSize(width, height);
    }

}

export { NormalPass };
