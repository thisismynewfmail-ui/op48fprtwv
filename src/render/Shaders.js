/* SILICONE DREAMS — Shader sources
 * All GLSL lives here so the passes that use it stay readable.
 */

/* ------------------------------------------------------------ COMMON */

export const NOISE_GLSL = /* glsl */`
  float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
  float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  vec2 hash22(vec2 p){
    vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
    p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy);
  }
  float vnoise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
               mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y);
  }
  float fbm(vec2 p){
    float s=0.0, a=0.5;
    for(int i=0;i<5;i++){ s+=vnoise(p)*a; p*=2.02; a*=0.5; }
    return s;
  }
`;

/* --------------------------------------------------------------- SEA */

/**
 * The violet ocean of plate 1. Gerstner-ish sum of sines for the surface,
 * a fake fresnel for the horizon glare, and a sun glitter term that walks
 * with the wave normals.
 */
export const SEA_VERT = /* glsl */`
  uniform float uTime;
  uniform float uWaveScale;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;

  vec3 waveSum(vec2 p, out vec3 nrm){
    float h = 0.0;
    vec2 d = vec2(0.0);
    float amp = 0.30 * uWaveScale, freq = 0.055, spd = 0.55;
    vec2 dir = normalize(vec2(0.82, 0.57));
    for(int i=0;i<5;i++){
      float ph = dot(p, dir)*freq + uTime*spd;
      h += sin(ph)*amp;
      d += dir*cos(ph)*amp*freq;
      amp *= 0.55; freq *= 1.85; spd *= 1.18;
      dir = normalize(vec2(dir.x*0.62 - dir.y*0.78, dir.x*0.78 + dir.y*0.62));
    }
    nrm = normalize(vec3(-d.x, 1.0, -d.y));
    return vec3(0.0, h, 0.0);
  }

  void main(){
    vec3 wp = (modelMatrix * vec4(position,1.0)).xyz;
    vec3 n;
    wp += waveSum(wp.xz, n);
    vWorld = wp;
    vNormal = n;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

export const SEA_FRAG = /* glsl */`
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  ${NOISE_GLSL}

  void main(){
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormal);
    // ripple detail the vertex waves are too coarse to carry
    float r = fbm(vWorld.xz*0.55 + uTime*0.12) - fbm(vWorld.xz*0.61 - uTime*0.09);
    N = normalize(N + vec3(r*0.35, 0.0, r*0.28));

    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    float depth = smoothstep(0.0, 240.0, length(vWorld.xz - cameraPosition.xz));

    vec3 base = mix(uShallow, uDeep, depth*0.7);
    vec3 col = mix(base, uSky, clamp(fres*1.15, 0.0, 0.92));

    // specular glitter
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N,H),0.0), 220.0);
    float glint = pow(max(dot(N,H),0.0), 26.0)*0.16;
    col += uSun*(spec*1.6 + glint);

    // foam catching the wave crests
    float crest = smoothstep(0.32, 0.62, r + 0.5);
    col = mix(col, vec3(0.92,0.90,0.98), crest*0.05);

    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

/* --------------------------------------------------------------- SKY */

/** Equirectangular sky dome with an animated cloud drift. */
export const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  varying vec2 vUv;
  void main(){
    vDir = normalize(position);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

export const SKY_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uDrift;
  uniform vec3 uTint;
  uniform float uExposure;
  uniform float uDilate;
  varying vec3 vDir;
  varying vec2 vUv;

  void main(){
    vec2 uv = vUv;
    uv.x = fract(uv.x + uTime*uDrift);
    vec3 c = texture2D(uMap, uv).rgb;
    c *= uTint * uExposure;
    // dilation drains the sky toward amber monochrome
    float l = dot(c, vec3(0.299,0.587,0.114));
    c = mix(c, vec3(l)*vec3(1.18,0.94,0.62), uDilate*0.55);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------ THE CRT PASS */

/**
 * The signature look. In one pass:
 *   - barrel distortion, so the image bows like curved glass
 *   - per-channel UV offset (chromatic aberration) that grows toward the edge
 *   - VHS tracking: a slow horizontal band that tears and desaturates
 *   - aperture-grille scanlines and a triad mask
 *   - 16-bit colour quantisation with an ordered Bayer dither
 *   - vignette, grain, and a chrono tint that pushes amber as time dilates
 */
export const CRT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tNoise;
  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uWarp;
  uniform float uChroma;
  uniform float uScan;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uDither;
  uniform float uTracking;
  uniform float uDilate;
  uniform float uGlitch;
  uniform float uDamage;
  uniform float uFade;
  uniform vec3  uFadeColor;
  varying vec2 vUv;

  float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

  // 4x4 ordered Bayer matrix, built from nested 2x2 (no array indexing,
  // which GLSL ES 1.0 will not let us do with a computed index)
  float bayer2(vec2 a){ a = floor(a); return fract(a.x*0.5 + a.y*a.y*0.75); }
  float bayer4(vec2 a){ return bayer2(a*0.5)*0.25 + bayer2(a); }
  float bayer(vec2 p){ return bayer4(p) - 0.46875; }

  // Curvature with compensating overscan: the corner expansion is divided
  // back out, so bending the image never reveals a black frame around it.
  vec2 barrel(vec2 uv, float k){
    vec2 c = uv*2.0 - 1.0;
    float r2 = dot(c,c);
    float corner = 1.0 + k*0.32 + k*k*0.20;     // expansion at r2 = 2
    c /= corner;
    r2 = dot(c,c);
    c *= 1.0 + k*r2*0.16 + k*k*r2*r2*0.05;
    return c*0.5 + 0.5;
  }

  void main(){
    vec2 uv = vUv;

    // --- VHS tracking band: a slow wave that tears the scanlines sideways
    float band = fract(uv.y*1.0 - uTime*0.055);
    float inBand = smoothstep(0.0, 0.04, band) * (1.0 - smoothstep(0.055, 0.10, band));
    float tear = inBand * uTracking * (0.004 + 0.010*hash21(vec2(uTime*3.0, floor(uv.y*220.0))));
    uv.x += tear;
    // occasional whole-frame roll
    uv.x += uTracking * 0.0016 * sin(uv.y*90.0 + uTime*7.0);

    // --- glitch: horizontal slices displaced, fired by damage or by wraith deaths
    float g = uGlitch + uDamage*0.5;
    if (g > 0.001){
      float slice = floor(uv.y*24.0);
      float rr = hash21(vec2(slice, floor(uTime*22.0)));
      if (rr > 1.0 - g*0.55) uv.x += (hash21(vec2(slice*3.1, floor(uTime*22.0)))-0.5)*g*0.14;
    }

    // --- geometry
    vec2 wuv = barrel(uv, uWarp);
    if (wuv.x < -0.002 || wuv.x > 1.002 || wuv.y < -0.002 || wuv.y > 1.002){
      gl_FragColor = vec4(0.0,0.0,0.0,1.0); return;
    }
    wuv = clamp(wuv, 0.0, 1.0);

    // --- chromatic aberration, stronger toward the corners
    vec2 dir = wuv - 0.5;
    float amt = uChroma * (0.0016 + dot(dir,dir)*0.0075) * (1.0 + g*4.0 + uDamage*2.0);
    vec3 col;
    col.r = texture2D(tDiffuse, wuv + dir*amt).r;
    col.g = texture2D(tDiffuse, wuv).g;
    col.b = texture2D(tDiffuse, wuv - dir*amt).b;

    // --- band desaturation + brightness lift where the tape is worn
    col = mix(col, vec3(dot(col, vec3(0.33))), inBand*uTracking*0.28);
    col += inBand*uTracking*0.035;

    // --- chrono grade: dilation pushes the whole frame amber and crushes blues
    if (uDilate > 0.001){
      float l = dot(col, vec3(0.299,0.587,0.114));
      vec3 amber = vec3(l*1.22, l*0.98, l*0.55);
      col = mix(col, amber, uDilate*0.62);
      col += vec3(0.06,0.03,0.0)*uDilate;
    }
    // --- damage grade: red crush
    col = mix(col, vec3(col.r*1.25, col.g*0.42, col.b*0.42), uDamage*0.75);

    // --- aperture grille + scanlines
    // These are artefacts of the DISPLAY, not of the render buffer, so they
    // are computed in output pixels. Deriving them from the (lower) internal
    // resolution made the mask beat against the upscale into heavy moire.
    if (uScan > 0.001){
      float px = gl_FragCoord.x;
      float py = gl_FragCoord.y;
      float triad = 0.90 + 0.10*cos(px*2.0943951);        // 3-pixel phosphor triad
      float scan  = 0.84 + 0.16*sin(py*3.14159265);
      float inter = 1.0 - 0.015*step(0.5, fract(py*0.5 + uTime*24.0));
      col *= mix(1.0, triad*scan*inter, uScan);
      // put back the light the mask removed, so low settings do not just
      // darken the frame
      col *= 1.0 + uScan*0.13;
    }

    // --- vignette
    float d = length(vUv - 0.5);
    col *= mix(1.0, smoothstep(0.92, 0.28, d), uVignette*0.85);

    // --- grain (from a noise texture, scrolled)
    if (uGrain > 0.001){
      vec3 n = texture2D(tNoise, wuv*uResolution/128.0 + vec2(hash21(vec2(uTime,1.0)), hash21(vec2(2.0,uTime)))).rgb;
      col += (n - 0.5) * uGrain * 0.085;
    }

    // --- colour quantisation with an ordered dither.
    // The LEVEL COUNT scales with the slider too -- quantising to 32 levels
    // regardless and only fading the dither noise left permanent banding.
    if (uDither > 0.001){
      float levels = mix(256.0, 24.0, clamp(uDither, 0.0, 1.0));
      float b = bayer(gl_FragCoord.xy) * uDither;
      col = floor(col*levels + 0.5 + b) / levels;
    }

    col = mix(col, uFadeColor, uFade);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------- CHRONO OVERLAY */

/** Radial time-ripple drawn when a rewind fires. */
export const RIPPLE_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uStrength;
  uniform vec2  uCenter;
  uniform float uAspect;
  varying vec2 vUv;
  void main(){
    vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float w = sin(r*26.0 - uTime*11.0) * exp(-r*3.4) * uStrength;
    vec2 uv = vUv + normalize(d + 1e-6) * w * 0.035;
    vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
    // rings pick up a cyan/gold split
    c.r = texture2D(tDiffuse, clamp(uv + normalize(d+1e-6)*w*0.012, 0.0, 1.0)).r;
    c.b = texture2D(tDiffuse, clamp(uv - normalize(d+1e-6)*w*0.012, 0.0, 1.0)).b;
    c += vec3(0.35,0.55,0.8) * abs(w) * 1.6;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/* ------------------------------------------------------ MISC SHADERS */

/** Additive energy shell used by projectiles, portals and stasis fields. */
export const ENERGY_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBands;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  void main(){
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.1);
    float band = 0.5 + 0.5*sin(vUv.y*uBands - uTime*3.4);
    float n = fbm(vUv*7.0 + uTime*0.6);
    float a = (fres*0.85 + band*0.20 + n*0.22) * uOpacity;
    gl_FragColor = vec4(uColor*(0.7 + fres*1.4 + n*0.4), clamp(a,0.0,1.0));
  }
`;

export const ENERGY_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main(){
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

/** Stasis field: the bubble that hangs in the air where time has stopped. */
export const STASIS_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  void main(){
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), 3.0);
    // a slow hexagonal shimmer, frozen mid-motion
    vec2 g = vUv*vec2(22.0, 11.0);
    vec2 gi = floor(g);
    float cell = hash21(gi);
    float pulse = 0.5 + 0.5*sin(uTime*0.6 + cell*6.28);
    float grid = smoothstep(0.42, 0.5, max(abs(fract(g.x)-0.5), abs(fract(g.y)-0.5)));
    float a = (fres*0.9 + grid*0.25*pulse) * uOpacity;
    gl_FragColor = vec4(uColor*(1.0+fres*1.5), clamp(a, 0.0, 1.0));
  }
`;
