// Fisheye lens (WebGL). Square output; the centre is magnified and straight lines
// bow outward, with soft vignetting and a hint of colour fringing at the edge.
// Same maths for the live lens view and for the captured photo, so the print
// matches what people saw in the lens.

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform sampler2D tex;
uniform vec2 res;        // output size in px
uniform vec2 crop;       // (s/vw, s/vh): centre-square crop of the video
uniform float a;         // lens strength (radians)
uniform float mirror;    // 1.0 = mirror horizontally
uniform float vignette;

vec2 lens(vec2 p, float k) {
  float r = length(p);
  if (r < 1e-5) return p;
  float rr = r / 1.41421356;
  float sr = tan(rr * a) / tan(a) * 1.41421356 * k;
  return p / r * sr;
}
vec3 sample(vec2 src) {
  src.x *= mirror > 0.5 ? -1.0 : 1.0;
  vec2 uv = 0.5 + src * 0.5 * crop;
  return texture2D(tex, clamp(uv, 0.0, 1.0)).rgb;
}
void main() {
  vec2 p = gl_FragCoord.xy / res * 2.0 - 1.0;
  float r = length(p);
  float fringe = 0.012 * r * r;
  vec3 col;
  col.r = sample(lens(p, 1.0 + fringe)).r;
  col.g = sample(lens(p, 1.0)).g;
  col.b = sample(lens(p, 1.0 - fringe)).b;
  col *= 1.0 - vignette * smoothstep(0.72, 1.42, r);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** strength 0..1 → lens angle */
const angle = (strength) => 0.05 + Math.max(0, Math.min(1, strength)) * 1.3;

export class FisheyeView {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: preserve, antialias: false });
    this.gl = gl;
    if (!gl) return;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    this._tex = tex;
    this._buf = buf;
    this._prog = prog;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.u = Object.fromEntries(
      ["res", "crop", "a", "mirror", "vignette"].map((n) => [n, gl.getUniformLocation(prog, n)])
    );
  }

  get ok() { return !!this.gl; }

  /** Draw one frame of `video` at the canvas's current size. */
  draw(video, { strength = 0.65, mirror = false, vignette = 0.55 } = {}) {
    const gl = this.gl;
    if (!gl || !video.videoWidth) return false;
    const { width: w, height: h } = this.canvas;
    gl.viewport(0, 0, w, h);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    } catch {
      return false;
    }
    const s = Math.min(video.videoWidth, video.videoHeight);
    gl.uniform2f(this.u.res, w, h);
    gl.uniform2f(this.u.crop, s / video.videoWidth, s / video.videoHeight);
    gl.uniform1f(this.u.a, angle(strength));
    gl.uniform1f(this.u.mirror, mirror ? 1 : 0);
    gl.uniform1f(this.u.vignette, vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  /** Free the GPU side (program, buffer, texture, context). Safe to call twice. */
  dispose() {
    const gl = this.gl;
    if (!gl) return;
    this.gl = null;
    try {
      gl.deleteTexture(this._tex);
      gl.deleteBuffer(this._buf);
      gl.deleteProgram(this._prog);
    } catch {}
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    // a 1×1 canvas lets the browser drop the backing store right away
    this.canvas.width = this.canvas.height = 1;
  }
}

/** One fisheye frame on a fresh canvas (for capture). Returns null without WebGL. */
export function renderFisheyeCanvas(video, { size = 1200, strength = 0.65, mirror = false, vignette = 0.45 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const view = new FisheyeView(c, { preserve: true });
  if (!view.ok || !view.draw(video, { strength, mirror, vignette })) {
    view.dispose();
    return null;
  }
  // copy to a 2D canvas so the GL context can be released right away
  const out = document.createElement("canvas");
  out.width = out.height = size;
  out.getContext("2d").drawImage(c, 0, 0);
  view.dispose();
  return out;
}
