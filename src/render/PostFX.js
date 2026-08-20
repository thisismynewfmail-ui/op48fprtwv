/* HALCYON — Post-processing
 *
 * Render at a fraction of the display resolution, bloom it, tone-map it,
 * then run the whole frame through a CRT/VHS composite. The low internal
 * resolution is not a performance concession — it is the point. 2003 games
 * were soft, and upscaling a 0.62x buffer is what that softness *is*.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CRT_FRAG, RIPPLE_FRAG } from './Shaders.js';
import { cfg, onCfgChange } from '../core/Config.js';
import { T } from '../world/Materials.js';
import { clamp, damp } from '../core/Time.js';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(1);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Tone-map and encode FIRST, then bloom. Thresholding in linear HDR made
    // the whole sky pass the test and the frame turned to milk; in display
    // space a threshold of 0.78 means what it looks like it means.
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.86);
    this.composer.addPass(this.bloom);

    this.ripple = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1.777 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: RIPPLE_FRAG,
    });
    this.ripple.enabled = false;
    this.composer.addPass(this.ripple);

    this.crt = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tNoise: { value: T.noise || null },
        uResolution: { value: new THREE.Vector2(1280, 720) },
        uTime: { value: 0 },
        uWarp: { value: 1 },
        uChroma: { value: 1 },
        uScan: { value: 1 },
        uGrain: { value: 1 },
        uVignette: { value: 1 },
        uDither: { value: 1 },
        uTracking: { value: 1 },
        uDilate: { value: 0 },
        uGlitch: { value: 0 },
        uDamage: { value: 0 },
        uFade: { value: 0 },
        uFadeColor: { value: new THREE.Color(0, 0, 0) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: CRT_FRAG,
    });
    this.crt.renderToScreen = true;
    this.composer.addPass(this.crt);

    this.glitch = 0;
    this.glitchDecay = 3.2;
    this.damageFlash = 0;
    this.rippleT = 0;
    this.fade = 0;
    this.fadeTarget = 0;
    this.fadeSpeed = 1;

    this.applyConfig();
    onCfgChange(() => this.applyConfig());
  }

  /**
   * Insert a second scene pass right after the world pass, with the depth
   * buffer cleared. The weapon viewmodel lives there so it is composited
   * over the world without ever intersecting it.
   */
  addViewPass(scene, camera) {
    const pass = new RenderPass(scene, camera);
    pass.clear = false;
    pass.clearDepth = true;
    const at = this.composer.passes.indexOf(this.renderPass) + 1;
    this.composer.insertPass(pass, at);
    this.viewPass = pass;
    return pass;
  }

  applyConfig() {
    const u = this.crt.uniforms;
    u.uWarp.value = cfg.r_warp;
    u.uChroma.value = cfg.r_chroma;
    u.uScan.value = cfg.r_crt;
    u.uGrain.value = cfg.r_grain;
    u.uVignette.value = cfg.r_vignette;
    u.uDither.value = cfg.r_dither;
    u.uTracking.value = cfg.r_tracking;
    this.bloom.strength = cfg.r_bloom;
    this.bloom.enabled = cfg.r_bloom > 0.01;
    if (T.noise && !u.tNoise.value) u.tNoise.value = T.noise;
    this.resize(this._w || window.innerWidth, this._h || window.innerHeight);
  }

  resize(w, h) {
    this._w = w; this._h = h;
    const s = clamp(cfg.r_scale, 0.25, 1.0);
    const rw = Math.max(160, Math.round(w * s));
    const rh = Math.max(120, Math.round(h * s));
    this.renderer.setSize(w, h, false);
    this.composer.setSize(rw, rh);
    this.bloom.setSize(Math.round(rw / 2), Math.round(rh / 2));
    this.crt.uniforms.uResolution.value.set(rw, rh);
    this.ripple.uniforms.uAspect.value = w / h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** short, sharp screen tear — wraith deaths, terminal boots, hard hits */
  kick(amount = 0.6, decay = 3.2) {
    this.glitch = Math.max(this.glitch, amount);
    this.glitchDecay = decay;
  }

  flashDamage(amount = 0.5) {
    this.damageFlash = Math.min(1, this.damageFlash + amount);
  }

  /** expanding time-ripple centred on the screen */
  pulseRipple() {
    this.rippleT = 1.0;
    this.ripple.enabled = true;
  }

  fadeTo(target, speed = 1, colour = 0x000000) {
    this.fadeTarget = target;
    this.fadeSpeed = speed;
    this.crt.uniforms.uFadeColor.value.setHex(colour);
  }

  update(dt, dilation) {
    const u = this.crt.uniforms;
    u.uTime.value += dt;
    u.uDilate.value = damp(u.uDilate.value, dilation, 9, dt);

    this.glitch = Math.max(0, this.glitch - dt * this.glitchDecay);
    u.uGlitch.value = this.glitch;

    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.7);
    u.uDamage.value = this.damageFlash * 0.9;

    this.fade = damp(this.fade, this.fadeTarget, this.fadeSpeed * 4, dt);
    if (Math.abs(this.fade - this.fadeTarget) < 0.002) this.fade = this.fadeTarget;
    u.uFade.value = this.fade;

    if (this.rippleT > 0) {
      this.rippleT = Math.max(0, this.rippleT - dt * 0.85);
      this.ripple.uniforms.uTime.value += dt;
      this.ripple.uniforms.uStrength.value = this.rippleT * this.rippleT;
      if (this.rippleT <= 0) this.ripple.enabled = false;
    }

    // bloom swells slightly while time is dilated — everything glows in syrup
    this.bloom.strength = cfg.r_bloom * (1 + dilation * 0.5);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
