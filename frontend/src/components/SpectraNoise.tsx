"use client";

/**
 * SpectraNoise — WebGL animated noise background.
 *
 * Ported locally from the Framer Spectra Noise component (Framer code
 * components depend on the `framer` runtime package which doesn't exist
 * in plain Next.js, so we strip out the Framer-Studio property controls
 * and `useIsStaticRenderer` hook and keep the shader + canvas plumbing).
 *
 * The shader is a CPPN (Compositional Pattern-Producing Network) that
 * generates organic flowing colour fields. We expose just the props we
 * care about and pick defaults that read as a violet aurora.
 */

import { useEffect, useRef, useState } from "react";

const VERTEX_SHADER = `
attribute vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}
`;

const FRAGMENT_SHADER = `
#ifdef GL_ES
precision lowp float;
#endif
uniform vec2 uResolution;
uniform float uTime;
uniform float uHueShift;
uniform float uNoise;
uniform float uScan;
uniform float uScanFreq;
uniform float uWarp;
#define iTime uTime
#define iResolution uResolution

vec4 buf[8];
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}

mat3 rgb2yiq=mat3(0.299,0.587,0.114,0.596,-0.274,-0.322,0.211,-0.523,0.312);
mat3 yiq2rgb=mat3(1.0,0.956,0.621,1.0,-0.272,-0.647,1.0,-1.106,1.703);

vec3 hueShiftRGB(vec3 col,float deg){
  vec3 yiq=rgb2yiq*col;
  float rad=radians(deg);
  float cosh=cos(rad),sinh=sin(rad);
  vec3 yiqShift=vec3(yiq.x,yiq.y*cosh-yiq.z*sinh,yiq.y*sinh+yiq.z*cosh);
  return clamp(yiq2rgb*yiqShift,0.0,1.0);
}

vec4 sigmoid(vec4 x){return 1./(1.+exp(-x));}

vec4 cppn_fn(vec2 coordinate,float in0,float in1,float in2){
  buf[6]=vec4(coordinate.x,coordinate.y,0.3948333106474662+in0,0.36+in1);
  buf[7]=vec4(0.14+in2,sqrt(coordinate.x*coordinate.x+coordinate.y*coordinate.y),0.,0.);
  buf[0]=mat4(vec4(6.5404263,-3.6126034,0.7590882,-1.13613),vec4(2.4582713,3.1660357,1.2219609,0.06276096),vec4(-5.478085,-6.159632,1.8701609,-4.7742867),vec4(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]+mat4(vec4(0.8473259,-5.722911,3.975766,1.6522468),vec4(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(0.21808943,1.1243913,-1.7969975,5.0294676);
  buf[1]=mat4(vec4(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4(0.8631464,1.7432913,5.643898,1.6106541),vec4(2.4941394,-3.5012043,1.7184316,6.357333),vec4(3.310376,8.209261,1.1355612,-1.165539))*buf[6]+mat4(vec4(5.24046,-13.034365,0.009859298,15.870829),vec4(2.987511,3.129433,-0.89023495,-1.6822904),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-5.9457836,-6.573602,-0.8812491,1.5436668);
  buf[0]=sigmoid(buf[0]);buf[1]=sigmoid(buf[1]);
  buf[2]=mat4(vec4(-15.219568,8.095543,-2.429353,-1.9381982),vec4(-5.951362,4.3115187,2.6393783,1.274315),vec4(-7.3145227,6.7297835,5.2473326,5.9411426),vec4(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]+mat4(vec4(-11.967154,-11.608155,6.1486754,11.237008),vec4(2.124141,-6.263192,-1.7050359,-0.7021966),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-4.17164,-3.2281182,-4.576417,-3.6401186);
  buf[3]=mat4(vec4(3.1832156,-13.738922,1.879223,3.233465),vec4(0.64300746,12.768129,1.9141049,0.50990224),vec4(-0.049295485,4.4807224,1.4733979,1.801449),vec4(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]+mat4(vec4(-0.1285731,7.720628,-3.1425676,4.742367),vec4(0.6393625,3.714393,-0.8108378,-0.39174938),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-1.1811101,-21.621881,0.7851888,1.2329718);
  buf[2]=sigmoid(buf[2]);buf[3]=sigmoid(buf[3]);
  buf[4]=mat4(vec4(5.214916,-7.183024,2.7228765,2.6592617),vec4(-5.601878,-25.3591,4.067988,0.4602802),vec4(-10.57759,24.286327,21.102104,37.546658),vec4(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]+mat4(vec4(-17.6526,-10.507558,2.2587414,12.462782),vec4(6.265566,-502.75443,-12.642513,0.9112289),vec4(-10.983244,20.741234,-9.701768,-0.7635988),vec4(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]+mat4(vec4(12.785233,-16.345072,-0.39901125,1.7955981),vec4(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4(19.872723,-7.337935,-42.941723,-98.52709),vec4(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]+mat4(vec4(-16.298317,3.5471997,-0.44300047,-9.444417),vec4(57.5077,-35.609753,16.163465,-4.1534753),vec4(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]+vec4(-7.67914,15.927437,1.3207729,-1.6686112);
  buf[5]=mat4(vec4(-1.4109162,-0.372762,-3.770383,-21.367174),vec4(-6.2103205,-9.35908,0.92529047,8.82561),vec4(11.460242,-22.348068,13.625772,-18.693201),vec4(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]+mat4(vec4(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4(1.5462853,6.5488915,1.9701879,-0.58291394),vec4(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4(-5.7973905,10.134961,-2.3395722,-5.12359311),vec4(-0.5258442,0.43852118,9.6752825,-22.853785),vec4(2.062431,0.099892326,-4.3196306,-17.730087))*buf[0]+mat4(vec4(2.5184598,5.30267,-6.545563,-15.790176),vec4(-6.0438633,-5.415399,-43.591583,28.551912),vec4(-16.00161,18.84728,4.212382,8.394307),vec4(3.0958717,8.657522,-5.0237565,-4.450633))*buf[2]+mat4(vec4(-4.4768,-5.5010443,1.6985557,-67.05806),vec4(6.897715,1.9004834,1.8680354,2.3915145),vec4(2.5231109,4.081538,11.158006,1.7294737),vec4(2.0738268,7.386411,-4.256034,-306.24686))*buf[3]+vec4(8.258898,-17.132736,1.6889864,-4.5852966);
  buf[4]=sigmoid(buf[4]);buf[5]=sigmoid(buf[5]);
  buf[6]=mat4(vec4(3.8534803,-6.3482175,1.3543309,-1.2640043),vec4(9.932754,2.9079645,-5.2770967,0.07150358),vec4(-0.13962056,3.3269649,28.34703,-4.918278),vec4(6.1044083,4.085355,-8.265602,-4.7027016))*buf[0]+mat4(vec4(5.098234,0.7509808,8.6507845,-17.15949),vec4(16.51939,-8.884479,-4.036479,-2.3946867),vec4(-2.6055532,-1.9866527,-2.2167742,-1.8135649),vec4(-5.9759874,4.8846445,6.7790847,3.5076547))*buf[1]+mat4(vec4(-2.8191125,-2.7028968,-5.743024,-0.27844876),vec4(1.4958696,-5.0517144,13.122226,15.735168),vec4(-2.9397483,-4.101023,-14.375265,-5.030483),vec4(-6.2599335,2.9848232,4.0950394,-0.94011575))*buf[2]+mat4(vec4(-5.674733,4.755022,4.3809423,4.8310084),vec4(1.7425908,-3.437416,2.117492,0.16342592),vec4(-104.56341,16.949184,-5.22543,-2.994248),vec4(3.8350096,-1.9364246,-5.900337,1.7946124))*buf[3]+mat4(vec4(-13.604192,-3.8060522,6.6583457,31.911177),vec4(25.164474,91.81147,11.840538,4.1503043),vec4(-0.7314397,6.768467,-6.3967767,4.034772),vec4(6.1714606,-0.32874924,3.4992442,-196.91893))*buf[4]+mat4(vec4(-8.923708,2.8142626,3.4806502,-3.1846354),vec4(5.1725626,5.1804223,-2.4009497,15.585794),vec4(1.2863957,2.0252278,-71.25271,-62.441242),vec4(-8.138444,0.50670296,-12.291733,-11.176166))*buf[5]+vec4(-7.3474145,4.390294,10.805477,5.6337385);
  buf[7]=mat4(vec4(-0.9385842,-4.7348723,-12.869276,-7.039391),vec4(5.3029537,7.5436664,1.4593618,8.91898),vec4(3.5101583,5.840625,2.2415268,-6.705987),vec4(-0.98861027,-2.117676,1.6794263,1.3817469))*buf[0]+mat4(vec4(2.9625452,0.,-1.8834411,-1.4806935),vec4(-3.5924516,0.,-1.3279216,-1.0918057),vec4(-2.3124623,0.,0.2662234,0.23235129),vec4(0.44178495,0.,-0.6299101,-0.5945583))*buf[1]+mat4(vec4(-0.9125601,0.,0.17828953,0.18300213),vec4(0.18182953,0.,-2.96544,-2.5819945),vec4(-4.9001055,0.,1.4195864,1.1868085),vec4(2.5176322,0.,-1.2584374,-1.0552157))*buf[2]+mat4(vec4(-2.1688404,0.,-0.7200217,-0.52666044),vec4(-1.438251,0.,0.15345335,0.15196142),vec4(0.272854,0.,0.945728,0.8861938),vec4(1.2766753,0.,-2.4218085,-1.968602))*buf[3]+mat4(vec4(-4.35166,0.,-22.683098,-18.0544),vec4(-41.954372,0.,0.63792,0.5470648),vec4(1.1078634,0.,-1.5489894,-1.3075932),vec4(-2.6444845,0.,-0.49252132,-0.39877754))*buf[4]+mat4(vec4(-0.91366625,0.,0.95609266,0.7923952),vec4(1.640221,0.,0.30616966,0.15693925),vec4(0.8639857,0.,1.1825981,0.94504964),vec4(2.176963,0.,0.35446745,0.3293795))*buf[5]+vec4(0.59547555,-0.58784515,-0.48177817,-1.0614829);
  buf[6]=sigmoid(buf[6]);buf[7]=sigmoid(buf[7]);
  buf[0]=mat4(vec4(2.5271258,1.9991658,4.6846647,0.),vec4(0.13042648,0.08864098,0.30187556,0.),vec4(-1.7718065,-1.4033192,-3.3355875,0.),vec4(3.1664357,2.638297,5.378702,0.))*buf[6]+mat4(vec4(-3.1724713,-2.6107926,-5.549295,0.),vec4(-2.851368,-2.249092,-5.3013067,0.),vec4(1.5203838,1.2212278,2.8404984,0.),vec4(1.5210563,1.2651345,2.683903,0.))*buf[7]+vec4(-1.5468478,-3.6171484,0.24762098,0.);
  buf[0]=sigmoid(buf[0]);
  return vec4(buf[0].x,buf[0].y,buf[0].z,1.);
}

void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 uv=fragCoord/uResolution.xy*2.-1.;
  uv.y*=-1.;
  uv+=uWarp*vec2(sin(uv.y*6.283+uTime*0.5),cos(uv.x*6.283+uTime*0.5))*0.05;
  fragColor=cppn_fn(uv,0.1*sin(0.3*uTime),0.1*sin(0.69*uTime),0.1*sin(0.44*uTime));
}

void main(){
  vec4 col;mainImage(col,gl_FragCoord.xy);
  col.rgb=hueShiftRGB(col.rgb,uHueShift);
  float scanline_val=sin(gl_FragCoord.y*uScanFreq)*0.5+0.5;
  col.rgb*=1.-(scanline_val*scanline_val)*uScan;
  col.rgb+=(rand(gl_FragCoord.xy+uTime)-0.5)*uNoise;
  gl_FragColor=vec4(clamp(col.rgb,0.0,1.0),1.0);
}
`;

export interface SpectraNoiseProps {
  /** Degrees of hue shift applied after the CPPN output. -180 to 180. */
  hueShift?: number;
  /** Per-pixel noise grain added on top. 0 to 1. */
  noiseIntensity?: number;
  /** CRT-style scanline darkening. 0 to 1. Leave at 0 unless you want that look. */
  scanlineIntensity?: number;
  /** Scanline frequency. 0 to 0.1. */
  scanlineFrequency?: number;
  /** Domain warp for the CPPN coordinates. 0 to 2. */
  warpAmount?: number;
  /** Animation speed multiplier. 0 to 3. */
  speed?: number;
  /** Render resolution multiplier. 0.25 to 2. Lower = faster, blurrier. */
  resolutionScale?: number;
  /** Optional className for the canvas (positioning, opacity, etc.). */
  className?: string;
  /** Optional inline style for the canvas. */
  style?: React.CSSProperties;
}

export function SpectraNoise({
  hueShift = 0,
  noiseIntensity = 0,
  scanlineIntensity = 0,
  scanlineFrequency = 0,
  warpAmount = 0,
  speed = 0.5,
  resolutionScale = 1,
  className,
  style,
}: SpectraNoiseProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl =
        (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
        (canvas.getContext(
          "experimental-webgl",
        ) as WebGLRenderingContext | null);
      if (!gl) {
        setWebglSupported(false);
        return;
      }
    } catch {
      setWebglSupported(false);
      return;
    }

    const compile = (
      type: number,
      source: string,
    ): WebGLShader | null => {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        console.error("SpectraNoise shader compile error:", gl!.getShaderInfoLog(shader));
        gl!.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      setWebglSupported(false);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setWebglSupported(false);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("SpectraNoise program link error:", gl.getProgramInfoLog(program));
      setWebglSupported(false);
      return;
    }
    gl.useProgram(program);

    const positions = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      uTime: gl.getUniformLocation(program, "uTime"),
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uHueShift: gl.getUniformLocation(program, "uHueShift"),
      uNoise: gl.getUniformLocation(program, "uNoise"),
      uScan: gl.getUniformLocation(program, "uScan"),
      uScanFreq: gl.getUniformLocation(program, "uScanFreq"),
      uWarp: gl.getUniformLocation(program, "uWarp"),
    };

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * resolutionScale));
      canvas.height = Math.max(1, Math.floor(h * resolutionScale));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl!.viewport(0, 0, canvas.width, canvas.height);
      gl!.uniform2f(uniforms.uResolution, w, h);
    };
    window.addEventListener("resize", resize);
    resize();

    const startTime = performance.now();
    let frame = 0;
    const render = () => {
      const currentTime = (performance.now() - startTime) / 1000;
      gl!.uniform1f(uniforms.uTime, currentTime * speed);
      gl!.uniform1f(uniforms.uHueShift, hueShift);
      gl!.uniform1f(uniforms.uNoise, noiseIntensity);
      gl!.uniform1f(uniforms.uScan, scanlineIntensity);
      gl!.uniform1f(uniforms.uScanFreq, scanlineFrequency);
      gl!.uniform1f(uniforms.uWarp, warpAmount);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [
    hueShift,
    noiseIntensity,
    scanlineIntensity,
    scanlineFrequency,
    warpAmount,
    speed,
    resolutionScale,
  ]);

  if (!webglSupported) {
    // Fallback: silent CSS gradient that resembles the violet aurora.
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.45) 0%, rgba(91,33,182,0.15) 35%, transparent 65%)",
          ...style,
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        ...style,
      }}
    />
  );
}

export default SpectraNoise;
