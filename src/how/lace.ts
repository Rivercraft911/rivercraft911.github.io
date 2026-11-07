// The essay's paper: an Apollonian packing drawn in faint ink, the gasket the circles of Indra's pearls
// pack into, its parameter breathing so slowly that it is never quite still and never asks to be looked at.
// Lines are drawn where the distance estimate is under a pixel, so they stay one pixel at any depth.
const canvas = document.querySelector<HTMLCanvasElement>('canvas#lace')!
const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })

const VS = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0, 1); }`

const FS = `#version 300 es
precision highp float;
uniform vec2 res;
uniform float t, dpr;
uniform vec4 ink;
out vec4 o;

// distance to the packing at p, for the packing with inversion constant s
float gasket(vec2 p, float s) {
  float k = 1.0;
  for (int i = 0; i < 10; i++) {
    p = 2.0 * fract(0.5 * p + 0.5) - 1.0;
    float m = s / dot(p, p);
    p *= m, k *= m;
  }
  return 0.25 * abs(p.y) / k;
}

void main() {
  float zoom = 2.6 / res.y;
  vec2 q = (gl_FragCoord.xy - 0.5 * res) * zoom;
  float a = 0.013 * t, c = cos(a), s = sin(a);
  vec2 p = mat2(c, s, -s, c) * q + vec2(0.31 + 0.02 * t, -0.17);
  float d = gasket(p, 1.18 + 0.06 * sin(0.041 * t)) / zoom; // in pixels
  float line = 1.0 - smoothstep(0.0, 0.9 * dpr, d);
  o = ink * line;
}`

function shader(type: number, src: string) {
  const s = gl!.createShader(type)!
  gl!.shaderSource(s, src)
  gl!.compileShader(s)
  return s
}

if (gl) {
  const prog = gl.createProgram()
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  const u = (n: string) => gl.getUniformLocation(prog, n)
  const res = u('res'), time = u('t'), dpr = u('dpr'), ink = u('ink')

  const dark = matchMedia('(prefers-color-scheme: dark)'), still = matchMedia('(prefers-reduced-motion: reduce)')
  const t0 = performance.now() - 4e5 * Math.random() // somewhere along its slow drift, a different page each visit

  const draw = (now: number) => {
    const r = Math.min(2, devicePixelRatio), w = Math.round(innerWidth * r), h = Math.round(innerHeight * r)
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h), gl.viewport(0, 0, w, h)
    gl.uniform2f(res, w, h)
    gl.uniform1f(time, (now - t0) / 1000)
    gl.uniform1f(dpr, r)
    dark.matches ? gl.uniform4f(ink, 0.07, 0.11, 0.09, 0.11) : gl.uniform4f(ink, 0.009, 0.014, 0.023, 0.09)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!still.matches) requestAnimationFrame(draw)
  }
  requestAnimationFrame(draw)
  addEventListener('resize', () => still.matches && requestAnimationFrame(draw))
  dark.addEventListener('change', () => still.matches && requestAnimationFrame(draw))
}
