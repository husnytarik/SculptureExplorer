// /js/curvature.js
// @ts-nocheck
import * as THREE from 'three';

export const CurvatureShader = {
    uniforms: {
        tDiffuse: { value: null },                 // sahne rengi (ShaderPass otomatik doldurur)
        tNormal: { value: null },                 // normal buffer (filters.js veriyor)
        resolution: { value: new THREE.Vector2(1, 1) },
        strength: { value: 0.8 },                  // 0..2 önerilir
        bias: { value: 0.35 }                  // 0..1 eşik
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
    uniform vec2  resolution;
    uniform float strength;
    uniform float bias;

    vec3 decodeN(vec3 c){ return normalize(c * 2.0 - 1.0); }

    void main(){
      vec2 texel = 1.0 / resolution;

      vec3 nC = decodeN(texture2D(tNormal, vUv).xyz);

      vec3 nR = decodeN(texture2D(tNormal, vUv + vec2(texel.x, 0.0)).xyz);
      vec3 nL = decodeN(texture2D(tNormal, vUv - vec2(texel.x, 0.0)).xyz);
      vec3 nU = decodeN(texture2D(tNormal, vUv + vec2(0.0, texel.y)).xyz);
      vec3 nD = decodeN(texture2D(tNormal, vUv - vec2(0.0, texel.y)).xyz);

      float gx = length(nR - nL);
      float gy = length(nU - nD);
      float m  = sqrt(gx*gx + gy*gy);

      float mask = smoothstep(bias, bias + 0.6*bias, m);

      vec3 base   = texture2D(tDiffuse, vUv).rgb;
      float k     = clamp(strength, 0.0, 2.0);
      vec3 shaded = base * (1.0 - mask * (0.6*k));
      gl_FragColor = vec4(shaded, 1.0);
    }
  `
};
