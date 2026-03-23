import { forwardRef, useEffect, useRef } from 'react'

const VERT = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uImageAspect;
uniform float uPixelSize;
uniform float uDotSize;
uniform float uHalftoneOpacity;
uniform float uBleed;
uniform vec2 uMouse; // normalized -1..1
uniform float uMouseStrength; // 0=no effect, 1=full effect
uniform float uContain; // 1=object-contain, 0=object-cover

in vec2 vUv;
out vec4 fragColor;

const float CYAN_STRENGTH    = 0.85;
const float MAGENTA_STRENGTH = 0.95;
const float YELLOW_STRENGTH  = 0.95;
const float BLACK_STRENGTH   = 1.10;

const float ANGLE_C = 15.0;
const float ANGLE_M = 45.0;
const float ANGLE_Y = 0.0;
const float ANGLE_K = 75.0;

mat2 rot(float deg) {
  float a = radians(deg);
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

vec2 objectCoverUv(vec2 uv) {
  float canvasAR = uResolution.x / uResolution.y;
  if (canvasAR > uImageAspect) {
    float f = uImageAspect / canvasAR;
    return vec2(uv.x, uv.y * f + (1.0 - f) * 0.5);
  } else {
    float f = canvasAR / uImageAspect;
    return vec2(uv.x * f + (1.0 - f) * 0.5, uv.y);
  }
}

vec2 objectContainUv(vec2 uv) {
  float canvasAR = uResolution.x / uResolution.y;
  if (canvasAR > uImageAspect) {
    float w = uImageAspect / canvasAR;
    float start = (1.0 - w) * 0.5;
    if (uv.x < start || uv.x > start + w) discard;
    return vec2((uv.x - start) / w, uv.y);
  } else {
    float h = canvasAR / uImageAspect;
    float start = (1.0 - h) * 0.5;
    if (uv.y < start || uv.y > start + h) discard;
    return vec2(uv.x, (uv.y - start) / h);
  }
}

vec2 fitUv(vec2 uv) {
  return uContain > 0.5 ? objectContainUv(uv) : objectCoverUv(uv);
}

// Halftone grid in canvas pixel space for consistent dot sizing
vec2 toGridUV(vec2 uv, float angleDeg, float ps) {
  return rot(angleDeg) * (uv * uResolution) / ps;
}

// Returns image UV for the center of the halftone cell at this canvas position
vec2 getCellCenterUV(vec2 uv, float angleDeg, float ps) {
  vec2 gridUV = toGridUV(uv, angleDeg, ps);
  vec2 cellCenter = floor(gridUV) + 0.5;
  vec2 centerScreen = rot(-angleDeg) * cellCenter * ps;
  return fitUv(centerScreen / uResolution);
}

float halftoneDot(vec2 uv, float angleDeg, float coverage, float ps) {
  vec2 gridUV = toGridUV(uv, angleDeg, ps);
  vec2 gv = fract(gridUV) - 0.5;
  float r = uDotSize * sqrt(clamp(coverage, 0.0, 1.0)) + uBleed;
  float aa = fwidth(length(gv));
  return 1.0 - smoothstep(r - aa, r + aa, length(gv));
}

// Composite over white paper — partial alpha blends toward white so edge anti-aliasing doesn't produce spurious dark dots
vec4 sampleForCMYK(vec2 uv) {
  vec4 s = texture(uTexture, uv);
  return vec4(mix(vec3(1.0), s.rgb, s.a), 1.0);
}

vec4 RGBtoCMYK(vec3 rgb) {
  float k = min(1.0 - rgb.r, min(1.0 - rgb.g, 1.0 - rgb.b));
  float invK = 1.0 - k;
  vec3 cmy = invK == 0.0 ? vec3(0.0) : (1.0 - rgb - k) / invK;
  return clamp(vec4(cmy, k), 0.0, 1.0);
}

void main() {
  if (texture(uTexture, fitUv(vUv)).a < 0.01) discard;

  vec2 fragNDC = vUv * 2.0 - 1.0;
  vec2 mouseDelta = fragNDC - uMouse;
  mouseDelta.x *= uResolution.x / uResolution.y;
  float proximity = smoothstep(0.55, 0.0, length(mouseDelta)) * uMouseStrength;
  float ps = uPixelSize * (1.0 + proximity * 2.5);

  vec2 uvC = getCellCenterUV(vUv, ANGLE_C, ps);
  vec2 uvM = getCellCenterUV(vUv, ANGLE_M, ps);
  vec2 uvY = getCellCenterUV(vUv, ANGLE_Y, ps);
  vec2 uvK = getCellCenterUV(vUv, ANGLE_K, ps);

  vec4 cmykC = RGBtoCMYK(sampleForCMYK(uvC).rgb);
  vec4 cmykM = RGBtoCMYK(sampleForCMYK(uvM).rgb);
  vec4 cmykY = RGBtoCMYK(sampleForCMYK(uvY).rgb);
  vec4 cmykK = RGBtoCMYK(sampleForCMYK(uvK).rgb);

  float dotC = halftoneDot(vUv, ANGLE_C, cmykC.x, ps);
  float dotM = halftoneDot(vUv, ANGLE_M, cmykM.y, ps);
  float dotY = halftoneDot(vUv, ANGLE_Y, cmykY.z, ps);
  float dotK = halftoneDot(vUv, ANGLE_K, cmykK.w, ps);

  vec3 color = vec3(1.0);
  color.r *= (1.0 - CYAN_STRENGTH * dotC);
  color.g *= (1.0 - MAGENTA_STRENGTH * dotM);
  color.b *= (1.0 - YELLOW_STRENGTH * dotY);
  color   *= (1.0 - BLACK_STRENGTH * dotK);

  vec4 originalSample = texture(uTexture, fitUv(vUv));
  vec3 original = originalSample.rgb;
  float alpha = originalSample.a;
  fragColor = vec4(mix(original, color, uHalftoneOpacity * alpha), alpha);
}`

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile error')
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram()!
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link error')
  }
  return program
}

type Props = {
  src: string
  pixelSize?: number
  dotSize?: number
  halftoneOpacity?: number
  objectFit?: 'cover' | 'contain'
  background?: string // tailwind bg class, e.g. 'bg-blue'. Pass '' for none.
  className?: string
  bleed?: number // fixed dot radius offset, causes dots to overlap adjacent cells (default 0)
  mouseEffect?: boolean
}

export const HalftoneBg = forwardRef<HTMLCanvasElement, Props>(
  ({ src, pixelSize = 4, dotSize = 0.7, halftoneOpacity = 1.0, objectFit = 'cover', background = 'bg-blue', className, bleed = 0, mouseEffect = false }, ref) => {
    const innerRef = useRef<HTMLCanvasElement>(null)

    const setRef = (el: HTMLCanvasElement | null) => {
      (innerRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = el
    }

    useEffect(() => {
      const canvas = innerRef.current
      if (!canvas) return

      const gl = canvas.getContext('webgl2')
      if (!gl) return

      let program: WebGLProgram
      let texture: WebGLTexture | null = null
      let imageAspect = 1

      try {
        program = createProgram(gl)
      } catch (e) {
        console.error('HalftoneBg shader error:', e)
        return
      }

      const quad = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

      const aPos   = gl.getAttribLocation(program, 'aPosition')
      const uTex   = gl.getUniformLocation(program, 'uTexture')
      const uRes   = gl.getUniformLocation(program, 'uResolution')
      const uImgAR = gl.getUniformLocation(program, 'uImageAspect')
      const uPx    = gl.getUniformLocation(program, 'uPixelSize')
      const uDot   = gl.getUniformLocation(program, 'uDotSize')
      const uHOp     = gl.getUniformLocation(program, 'uHalftoneOpacity')
      const uBleedLoc = gl.getUniformLocation(program, 'uBleed')
      const uMouse    = gl.getUniformLocation(program, 'uMouse')
      const uMouseStrengthLoc = gl.getUniformLocation(program, 'uMouseStrength')
      const uContain = gl.getUniformLocation(program, 'uContain')

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      let mouseX = 0, mouseY = 0
      const onMouseMove = (e: MouseEvent) => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1
        mouseY = (e.clientY / window.innerHeight) * 2 - 1
      }
      window.addEventListener('mousemove', onMouseMove)


      let animId: number | null = null

      function render() {
        if (!texture) return
        gl!.clearColor(0, 0, 0, 0)
        gl!.clear(gl!.COLOR_BUFFER_BIT)
        gl!.viewport(0, 0, canvas!.width, canvas!.height)
        gl!.useProgram(program)
        gl!.bindBuffer(gl!.ARRAY_BUFFER, quad)
        gl!.enableVertexAttribArray(aPos)
        gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0)
        gl!.activeTexture(gl!.TEXTURE0)
        gl!.bindTexture(gl!.TEXTURE_2D, texture)
        gl!.uniform1i(uTex, 0)
        gl!.uniform2f(uRes, canvas!.width, canvas!.height)
        gl!.uniform1f(uImgAR, imageAspect)
        gl!.uniform1f(uPx, pixelSize * devicePixelRatio)
        gl!.uniform1f(uDot, dotSize)
        gl!.uniform1f(uHOp, halftoneOpacity)
        gl!.uniform1f(uBleedLoc, bleed)
        gl!.uniform2f(uMouse, mouseX, mouseY)
        gl!.uniform1f(uMouseStrengthLoc, mouseEffect ? 1.0 : 0.0)
        gl!.uniform1f(uContain, objectFit === 'contain' ? 1.0 : 0.0)
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)
      }

      // Only loop via RAF when mouseEffect is on; otherwise render once on load/resize
      let visible = false
      function loop() {
        if (visible) render()
        animId = requestAnimationFrame(loop)
      }
      if (mouseEffect) loop()

      const io = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting
      }, { threshold: 0 })
      io.observe(canvas)

      const img = new Image()
      img.onload = () => {
        imageAspect = img.width / img.height
        texture = gl!.createTexture()
        gl!.bindTexture(gl!.TEXTURE_2D, texture)
        gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true) // align WebGL Y axis with image Y axis
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, img)
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
        if (!mouseEffect) render()
      }
      img.src = src

      const ro = new ResizeObserver(() => {
        canvas.width = canvas.clientWidth * devicePixelRatio
        canvas.height = canvas.clientHeight * devicePixelRatio
        if (!mouseEffect) render()
      })
      ro.observe(canvas)

      return () => {
        if (animId !== null) cancelAnimationFrame(animId)
        window.removeEventListener('mousemove', onMouseMove)
        ro.disconnect()
        io.disconnect()
        gl.deleteProgram(program)
        gl.deleteBuffer(quad)
        if (texture) gl.deleteTexture(texture)
      }
    }, [src, pixelSize, dotSize, halftoneOpacity, objectFit, bleed, mouseEffect])

    return <canvas ref={setRef} className={`${background} ${className ?? ''}`} />
  }
)

HalftoneBg.displayName = 'HalftoneBg'