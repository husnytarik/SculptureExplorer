// /js/rtiRaking.js
// @ts-nocheck
import * as THREE from 'three';

export const RakingLightShader = {
    uniforms: {
        tDiffuse: { value: null },                  // sahne rengi (ShaderPass doldurur)
        tNormal: { value: null },                  // NormalPass çıkışı
        resolution: { value: new THREE.Vector2(1, 1) },
        lightDir: { value: new THREE.Vector3(0.6, 0.6, 0.5).normalize() }, // UI’dan güncellenecek
        gain: { value: 1.2 },    // difüz kazanım (1.0–3.0)
        wrap: { value: 0.3 },    // wrap lambert (0–0.6) gölgeyi yumuşatır
        specPow: { value: 32.0 },   // speküler parlaklık (16–128)
        specStr: { value: 0.15 },   // speküler güç (0–0.4)
        rimStr: { value: 0.2 },    // hafif rim ekle (0–0.5)
        rimPow: { value: 2.0 }     // rim eğrisi
    },
    vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
    fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform vec3  lightDir;
    uniform float gain, wrap, specPow, specStr, rimStr, rimPow;

    // [0,1] -> [-1,1] normal decode
    vec3 decodeN(vec3 c){ return normalize(c*2.0 - 1.0); }

    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec3 N = decodeN(texture2D(tNormal, vUv).xyz);
      vec3 L = normalize(lightDir);
      vec3 V = vec3(0.0,0.0,1.0); // ekrana bakan
      vec3 H = normalize(L + V);

      // wrap lambert (occlusion gölge sert değil)
      float ndl = dot(N,L);
      float lambert = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
      lambert = pow(lambert, 1.0/gain); // gain ile kontrast

      // speküler
      float spec = pow(max(dot(N,H), 0.0), specPow) * specStr;

      // hafif rim (kenar vurgusu)
      float rim = pow(1.0 - max(dot(N,V), 0.0), rimPow) * rimStr;

      vec3 lit = base * lambert + spec + rim;

      // tonemap hafif
      lit = lit / (lit + vec3(1.0));
      gl_FragColor = vec4(lit, 1.0);
    }
  `
};
