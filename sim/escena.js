// Espacio virtual para probar el AR sin salir de casa.
//
//   escena three.js ──► cámara virtual ──► MediaStream ──► getUserMedia (falso) ──► 8th Wall REAL
//   trayectoria ─────► IMU sintético (devicemotion / deviceorientation) ──────────► 8th Wall REAL
//
// 8th Wall no sabe que es una simulación: recibe vídeo y sensores como en un
// móvil. Lo que dibuja encima es lo que se compara con la verdad, que aquí SÍ se
// conoce: dónde está de verdad la cámara y dónde deben caer los puntos.
import { trazar, rumboCamara, planoRayo, direccionCamara, haciaCamara, parsearGuia, RAD } from "../nucleo/ar-guia.js";

// ─────────────────────────────────────────────────────────────── utilidades
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const lienzo = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const suave = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

// ─────────────────────────────────────────────────────────────── texturas
function textura(THREE, c, rep = [1, 1]){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function texSuelo(THREE, r){
  const c = lienzo(1024, 1024), g = c.getContext("2d");
  const n = 8, s = 1024 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    const b = 95 + r() * 90, k = 0.55 + r() * 0.2;
    g.fillStyle = `rgb(${b | 0},${(b * (0.78 + r() * 0.1)) | 0},${(b * k) | 0})`;
    g.fillRect(i * s, j * s, s, s);
    for (let m = 0; m < 16; m++){            // vetas
      g.strokeStyle = `rgba(30,18,8,${0.12 + r() * 0.2})`; g.lineWidth = 1 + r() * 2;
      g.beginPath(); const y = j * s + r() * s, x = i * s + r() * s * 0.4;
      g.moveTo(x, y); g.bezierCurveTo(x + s * .3, y + (r() - .5) * 12, x + s * .6, y + (r() - .5) * 12, i * s + s, y + (r() - .5) * 20); g.stroke();
    }
  }
  g.strokeStyle = "rgba(20,14,8,.85)"; g.lineWidth = 5;
  for (let i = 0; i <= n; i++){ g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(1024, i * s); g.stroke(); }
  for (let k = 0; k < 9000; k++){ g.fillStyle = `rgba(${r() < .5 ? 0 : 255},${r() < .5 ? 0 : 255},${r() < .5 ? 0 : 255},.12)`;
    g.fillRect(r() * 1024, r() * 1024, 1 + r() * 2, 1 + r() * 2); }
  for (let k = 0; k < 30; k++){            // manchas
    const x = r() * 1024, y = r() * 1024, R = 20 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, "rgba(10,6,2,.45)"); gr.addColorStop(1, "rgba(10,6,2,0)");
    g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
  }
  return textura(THREE, c);
}

function pintarCartel(g, r, x, y, w, h){
  const hue = r() * 360;
  g.fillStyle = `hsl(${hue},60%,${45 + r() * 25}%)`; g.fillRect(x, y, w, h);
  g.fillStyle = `hsl(${(hue + 150) % 360},70%,${30 + r() * 30}%)`;
  for (let k = 0; k < 7; k++){
    const a = r();
    if (a < .4) g.fillRect(x + r() * w * .7, y + r() * h * .7, 8 + r() * w * .4, 8 + r() * h * .4);
    else if (a < .7){ g.beginPath(); g.arc(x + r() * w, y + r() * h, 6 + r() * 26, 0, 7); g.fill(); }
    else { g.strokeStyle = "#111"; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x + r() * w, y + r() * h); g.lineTo(x + r() * w, y + r() * h); g.stroke(); }
  }
  g.strokeStyle = "#1a1410"; g.lineWidth = 8; g.strokeRect(x, y, w, h);
}

function texPared(THREE, r, anchoM){
  const c = lienzo(2048, 512), g = c.getContext("2d");
  const gris = 200 + r() * 25;
  g.fillStyle = `rgb(${gris},${gris - 8},${gris - 22})`; g.fillRect(0, 0, 2048, 512);
  for (let k = 0; k < 22000; k++){ g.fillStyle = `rgba(0,0,0,${r() * .07})`; g.fillRect(r() * 2048, r() * 512, 1 + r() * 3, 1 + r() * 3); }
  g.fillStyle = "#3a2c22"; g.fillRect(0, 462, 2048, 50);                    // rodapié
  for (let k = 0; k < 4 + (r() * 3 | 0); k++){
    const w = 150 + r() * 220, h = 110 + r() * 150;
    pintarCartel(g, r, 100 + r() * (2048 - 300), 60 + r() * 150, w, h);
  }
  for (let k = 0; k < 2; k++){ g.fillStyle = "#26323a"; g.fillRect(150 + r() * 1600, 70, 170, 392); g.fillStyle = "#c9b45a"; g.fillRect(150 + r() * 0, 0, 0, 0); }
  return textura(THREE, c, [Math.max(1, Math.round(anchoM / 6)), 1]);
}

function texCaja(THREE, r){
  const c = lienzo(512, 512), g = c.getContext("2d");
  const h = r() * 360;
  g.fillStyle = `hsl(${h},55%,45%)`; g.fillRect(0, 0, 512, 512);
  const s = 64;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2){ g.fillStyle = `hsla(${(h + 40) % 360},60%,30%,.55)`; g.fillRect(i * s, j * s, s, s); }
  for (let k = 0; k < 50; k++){ g.fillStyle = `hsl(${r() * 360},70%,${25 + r() * 50}%)`; g.beginPath(); g.arc(r() * 512, r() * 512, 4 + r() * 18, 0, 7); g.fill(); }
  g.strokeStyle = "#101010"; g.lineWidth = 10; g.strokeRect(5, 5, 502, 502);
  return textura(THREE, c);
}

// ─────────────────────────────────────────────────────────────── la sala
function construirSala(THREE){
  const r = mulberry(7);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x887766);
  const X0 = -6, X1 = 6, Z0 = -14, Z1 = 4, H = 2.7;
  const plano = (w, h, tex, mat = {}) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, ...mat }));

  const suelo = plano(X1 - X0, Z1 - Z0, texSuelo(THREE, r)); suelo.rotation.x = -Math.PI / 2;
  suelo.material.map.repeat.set((X1 - X0) / 4.8, (Z1 - Z0) / 4.8);
  suelo.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); scene.add(suelo);

  const techoC = lienzo(512, 512), g = techoC.getContext("2d");
  g.fillStyle = "#d6d2c8"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#9a958a"; g.lineWidth = 3; for (let i = 0; i <= 4; i++){ g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); }
  g.fillStyle = "#fffbe6"; g.fillRect(40, 40, 80, 80); g.fillRect(296, 296, 80, 80);
  const techo = plano(X1 - X0, Z1 - Z0, textura(THREE, techoC, [(X1 - X0) / 3, (Z1 - Z0) / 3]));
  techo.rotation.x = Math.PI / 2; techo.position.set((X0 + X1) / 2, H, (Z0 + Z1) / 2); scene.add(techo);

  const pared = (w, x, z, ry) => { const m = plano(w, H, texPared(THREE, r, w)); m.position.set(x, H / 2, z); m.rotation.y = ry; scene.add(m); };
  pared(X1 - X0, (X0 + X1) / 2, Z0, 0);               // fondo
  pared(X1 - X0, (X0 + X1) / 2, Z1, Math.PI);         // detrás de quien arranca
  pared(Z1 - Z0, X0, (Z0 + Z1) / 2, Math.PI / 2);
  pared(Z1 - Z0, X1, (Z0 + Z1) / 2, -Math.PI / 2);

  // muebles y columnas, a los lados del recorrido
  const cajas = [[-3, -2, 1.0, .8], [3.2, -2.5, 1.2, 1.0], [-3.4, -8, 1.4, .9], [2.5, -9.5, 1.1, 1.3],
    [-4.8, -5, .8, .8], [5, -4.4, 1.5, .7], [0.8, -12, 1.2, .9], [-2.2, -11.2, .7, 1.0], [4.2, 1.8, 1.0, 1.0],
    [-4.5, 1.2, 1.3, .8], [2.2, 0.4, .5, .5], [-1.8, -3.9, .5, .45], [3.3, -6.3, .7, .6], [-0.2, -9.6, .8, .6]];
  for (const [x, z, h, w] of cajas){
    const t = texCaja(THREE, r);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.8 + r() * .5)), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, h / 2, z); m.rotation.y = r() * 1.2; scene.add(m);
  }
  for (const [x, z] of [[-4.2, -3], [4.4, -7.5], [-1, -13]]){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, H, 20), new THREE.MeshBasicMaterial({ map: texCaja(THREE, r) }));
    m.position.set(x, H / 2, z); scene.add(m);
  }
  return { scene, limites: { X0, X1, Z0, Z1, H } };
}

// ─────────────────────────────────────────────────────────────── trayectoria
/**
 * Guion → muestras a 200 Hz {x, z, rumbo} + las órdenes con su instante.
 * Acciones: {quieto:s} {andar:m, v} {girar:grados, dur:s} {orden:{guia, modo}} {foto:'nombre'}
 */
function compilar(guion, inicio){
  const dt = 0.005;
  const S = [];                               // muestras
  const ordenes = [], fotos = [];
  let x = inicio.x, z = inicio.z, psi = inicio.rumbo * RAD, v = 0, t = 0;
  const empujar = () => S.push({ t, x, z, psi, v });
  empujar();
  const avanzar = (vObj, dur) => { for (let s = 0; s < dur; s += dt){ v += (vObj - v) * Math.min(1, dt / 0.35); x += Math.sin(psi) * v * dt; z += -Math.cos(psi) * v * dt; t += dt; empujar(); } };
  for (const a of guion){
    if (a.quieto != null){ for (let s = 0; s < a.quieto; s += dt){ v += (0 - v) * Math.min(1, dt / 0.2); t += dt; empujar(); } }
    else if (a.andar != null){
      const vel = a.v ?? 0.8; let d = 0;
      while (d < a.andar){ const resta = a.andar - d; const vObj = resta < 0.7 ? Math.max(0.1, vel * resta / 0.7) : vel;
        v += (vObj - v) * Math.min(1, dt / 0.35); const dd = v * dt; x += Math.sin(psi) * dd; z += -Math.cos(psi) * dd; d += dd; t += dt; empujar(); }
    } else if (a.girar != null){
      const p0 = psi, n = Math.round(a.dur / dt);
      for (let k = 1; k <= n; k++){ psi = p0 + a.girar * RAD * suave(k / n); v *= 0.9; t += dt; empujar(); }
    } else if (a.orden) ordenes.push({ t, ...a.orden });
    else if (a.foto) fotos.push({ t, nombre: a.foto });
  }
  return { S, ordenes, fotos, duracion: t };
}

// ─────────────────────────────────────────────────────────────── escenarios
export const ESCENARIOS = {
  // De pie, tanteando; luego caminando. Cada orden se da con el móvil en la mano, en marcha.
  sala: {
    h: 1.4, pitch: 28, inicio: { x: 0, z: 0, rumbo: 0 },
    guion: [
      { quieto: 4 }, { foto: "arranque" },
      { orden: { guia: "10 adelante", modo: "pies" } }, { quieto: 3.5 }, { foto: "A-diez-al-frente" },
      { andar: 5.5, v: 0.7 }, { quieto: 0.8 },
      { orden: { guia: "2 adelante, 3 diag der", modo: "pies" } }, { quieto: 3.5 }, { foto: "B-dos-y-diagonal" },
      { girar: 90, dur: 3 }, { andar: 3.5, v: 0.7 }, { quieto: 0.8 },
      { orden: { guia: "6 izquierda", modo: "pies" } }, { quieto: 3.5 }, { foto: "C-izquierda-tras-girar" },
      { girar: -50, dur: 2.5 },
      { orden: { guia: "5 adelante", modo: "rayo" } }, { quieto: 3.5 }, { foto: "D-desde-el-anillo" },
      { quieto: 2 },
    ],
  },
};

// ─────────────────────────────────────────────────────────────── instalación
export async function instalarSimulacion({ THREE, ar, params, aviso }){
  const nombre = params.get("sim") || "sala";
  const esc = ESCENARIOS[nombre === "1" ? "sala" : nombre];
  if (!esc) throw new Error("escenario desconocido: " + nombre);
  const velEscala = parseFloat(params.get("vel")) || 1;       // <1 = más lento
  const h = parseFloat(params.get("hold")) || esc.h;           // altura del móvil en la mano
  const fov = parseFloat(params.get("fov")) || 64.58;   // el FOV vertical que 8th Wall asume para este vídeo (medido)             // grados verticales de la cámara virtual
  const W = 480, H = 640;                                       // fotograma de cámara, vertical 3:4
  const rnd = mulberry(1234);

  const { scene, limites } = construirSala(THREE);

  // ---- cámara que va al «vídeo»
  const camV = new THREE.PerspectiveCamera(fov, W / H, 0.05, 60);
  const rCam = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  rCam.setPixelRatio(1); rCam.setSize(W, H, false);
  const cv = rCam.domElement; cv.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(cv);
  const stream = cv.captureStream(30);

  // ---- vista de la verdad: misma pose, con los puntos buenos (capa 1)
  const rVer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById("cv-verdad") });
  rVer.setPixelRatio(1); rVer.setSize(240, 320, false);
  const camT = new THREE.PerspectiveCamera(fov, W / H, 0.05, 60);
  camT.layers.enable(1);
  const vc = document.getElementById("cv-verdad"); vc.style.aspectRatio = "3/4"; vc.style.height = "auto";
  const discoV = new THREE.CircleGeometry(0.09, 20).rotateX(-Math.PI / 2);
  const puntosVerdad = [];
  for (let i = 0; i < 80; i++){ const m = new THREE.Mesh(discoV, new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false }));
    m.layers.set(1); m.visible = false; m.renderOrder = 5; scene.add(m); puntosVerdad.push(m); }
  const verdadActual = { puntos: [] };

  // ---- cámara falsa para 8th Wall
  // El celular virtual tiene DOS objetivos traseros, como el del usuario: uno normal y un
  // tele de 2.9x. Si 8th Wall no pide un deviceId, el navegador abre `defecto`
  // (?defecto=tele reproduce el problema real: la vista sale ampliada).
  const LENTES = { "sim-ancha": { etiqueta: "camera2 0, facing back", zoom: 1 },
                   "sim-tele": { etiqueta: "camera2 2, facing back", zoom: 2.9 } };
  const defecto = params.get("defecto") === "tele" ? "sim-tele" : "sim-ancha";
  let lente = defecto;
  function usarLente(id){
    lente = id;
    const f = 2 * Math.atan(Math.tan(fov * RAD / 2) / LENTES[id].zoom) / RAD;     // FOV vertical de ese objetivo
    camV.fov = f; camT.fov = f; camV.updateProjectionMatrix(); camT.updateProjectionMatrix();
  }
  usarLente(defecto);
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = async c => {
    const pedido = c?.video?.deviceId?.exact ?? c?.video?.deviceId?.ideal;
    usarLente(LENTES[pedido] ? pedido : defecto);
    // un flujo NUEVO por llamada, como en un móvil: cerrar uno (una miniatura) no mata a los demás
    const s = stream.clone();
    try { Object.defineProperty(s.getVideoTracks()[0], "label", { value: LENTES[lente].etiqueta, configurable: true }); } catch {}
    return s;
  };
  md.enumerateDevices = async () => [
    { kind: "videoinput", label: LENTES["sim-ancha"].etiqueta, deviceId: "sim-ancha", groupId: "sim" },
    { kind: "videoinput", label: "camera2 1, facing front", deviceId: "sim-frontal", groupId: "sim" },
    { kind: "videoinput", label: LENTES["sim-tele"].etiqueta, deviceId: "sim-tele", groupId: "sim" },
  ];

  // ---- trayectoria
  const { S, ordenes, fotos, duracion } = compilar(esc.guion.map(a => a.andar != null && velEscala !== 1 ? { ...a, v: (a.v ?? .8) * velEscala } : a), esc.inicio);
  const T = velEscala === 1 ? 1 : 1;
  const muestraEn = t => { const i = Math.min(S.length - 1, Math.max(0, Math.round(t / 0.005))); return S[i]; };

  /** pose real de la cámara en el instante t (s del guion) */
  function pose(t){
    const s = muestraEn(t);
    const paso = 1.7, w = 2 * Math.PI * paso / 2;           // frecuencia de paso, según la velocidad
    const caminando = Math.min(1, s.v / 0.5);
    const ampL = 0.12 * suave(t / 1) * (1 - suave((t - 3) / 1));      // tanteo lateral de arranque
    const nL = (Math.sin(t * 2 * Math.PI * 0.5)) * ampL + Math.sin(t * w) * 0.018 * caminando;
    const bob = Math.sin(t * 2 * w) * 0.012 * caminando + Math.sin(t * 1.3) * 0.004;
    const dx = Math.cos(s.psi) * nL, dz = Math.sin(s.psi) * nL;       // lateral = a la derecha del rumbo
    const yawJ = (Math.sin(t * 0.9) * 1.2 + Math.sin(t * 2.3) * 0.5) * RAD;
    const pit = (esc.pitch + Math.sin(t * 0.7) * 2.5 + Math.sin(t * w) * 1.0 * caminando) * RAD;
    const rol = (Math.sin(t * w) * 1.5 * caminando + Math.sin(t * 0.5) * 0.8) * RAD;
    const pos = [s.x + dx, h + bob, s.z + dz];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pit, -(s.psi + yawJ), rol, "YXZ"));
    // YXZ: primero yaw (Y), luego pitch (X), luego roll (Z) intrínsecos
    return { pos, q: [q.x, q.y, q.z, q.w], psi: s.psi };
  }

  // ---- IMU sintético (marco del dispositivo = marco de la cámara trasera)
  const g0 = 9.81, hh = 0.004;
  function matriz(q){
    const [x, y, z, w] = q;
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  }
  const tMat = (R, v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
  const qInv = q => [-q[0], -q[1], -q[2], q[3]];
  const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const sesgoG = [0.004, -0.003, 0.002];
  function imu(t){
    const p0 = pose(t - hh), p1 = pose(t), p2 = pose(t + hh);
    const aw = [0, 1, 2].map(k => (p2.pos[k] - 2 * p1.pos[k] + p0.pos[k]) / (hh * hh));
    const R = matriz(p1.q);
    const ag = tMat(R, [aw[0], aw[1] + g0, aw[2]]);          // aceleración con gravedad, en el dispositivo
    const lin = tMat(R, aw);
    const dq = qMul(qInv(p0.q), p2.q);                          // giro en el marco del dispositivo
    const sg = dq[3] < 0 ? -1 : 1;
    const om = [2 * sg * dq[0] / (2 * hh), 2 * sg * dq[1] / (2 * hh), 2 * sg * dq[2] / (2 * hh)];
    const ruido = (s) => gauss(rnd) * s;
    const r2d = 180 / Math.PI;
    // marco ENU: x=este, y=norte(−z), z=arriba(y)
    const Re = [[R[0][0], R[0][1], R[0][2]], [-R[2][0], -R[2][1], -R[2][2]], [R[1][0], R[1][1], R[1][2]]];
    const beta = Math.asin(Math.max(-1, Math.min(1, Re[2][1])));
    const gamma = Math.atan2(-Re[2][0], Re[2][2]);
    const alpha = Math.atan2(-Re[0][1], Re[1][1]);
    return {
      acc: lin.map(v => v + ruido(0.03)), accG: ag.map(v => v + ruido(0.03)),
      rot: { alpha: (om[2] + sesgoG[2] + ruido(0.003)) * r2d, beta: (om[0] + sesgoG[0] + ruido(0.003)) * r2d, gamma: (om[1] + sesgoG[1] + ruido(0.003)) * r2d },
      ori: { alpha: (alpha * r2d + 360) % 360, beta: beta * r2d, gamma: gamma * r2d },
    };
  }

  // ---- reloj y bucles
  const est = { t0: null, corriendo: false, terminado: false, muestras: [], pix: [], ordenes: [], fotos: [], cola: [...ordenes], colaFotos: [...fotos] };
  const tScript = () => est.t0 == null ? 0 : (performance.now() - est.t0) / 1000;
  window.addEventListener("beforeunload", () => {});

  function enviarImu(){
    const t = est.corriendo ? tScript() : 0;
    const d = imu(Math.min(t, duracion));
    try {
      window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
        acceleration: { x: d.acc[0], y: d.acc[1], z: d.acc[2] },
        accelerationIncludingGravity: { x: d.accG[0], y: d.accG[1], z: d.accG[2] },
        rotationRate: d.rot, interval: 16,
      }));
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: d.ori.alpha, beta: d.ori.beta, gamma: d.ori.gamma, absolute: true }));
    } catch (e) { console.warn("[sim] IMU", e); }
  }
  setInterval(enviarImu, 16);

  let nFrames = 0;
  function colocarVerdad(o, p){
    // los puntos que DEBERÍAN verse, calculados desde la pose real
    const dir = direccionCamara(p.q);
    const rumbo = rumboCamara(p.q);
    let x = p.pos[0], z = p.pos[2], hueco = ar.op.hueco;
    if (o.modo === "rayo"){
      const r = planoRayo(p.pos, dir, ar.suelo);
      if (r){ const q = haciaCamara(r.p, p.pos, ar.op.offsetCamara); x = q[0]; z = q[2]; hueco = 0; }
    }
    const tr = trazar({ x, z, rumbo, tramos: o.tramos, hueco, paso: ar.op.paso, y: 0.02 });
    return { puntos: tr.puntos, origen: { x, z }, rumbo };
  }

  function tick(){
    const t = est.corriendo ? Math.min(tScript(), duracion) : 0;
    const p = pose(t);
    camV.position.set(...p.pos); camV.quaternion.set(...p.q); camV.updateMatrixWorld(true);
    rCam.render(scene, camV);
    camT.position.copy(camV.position); camT.quaternion.copy(camV.quaternion);
    rVer.render(scene, camT);
    nFrames++;

    if (est.corriendo){
      // órdenes y fotos pendientes
      while (est.cola.length && est.cola[0].t <= t){
        const o = est.cola.shift();
        const tramos = parsearGuia(o.guia);
        const verdad = colocarVerdad({ ...o, tramos }, p);
        const antes = ar.estado();
        const res = ar.poner(tramos, { modo: o.modo });
        puntosVerdad.forEach((m, i) => { const q = verdad.puntos[i]; m.visible = !!q; if (q) m.position.set(q.x, q.y, q.z); });
        est.ordenes.push({ t, guia: o.guia, modo: o.modo, res, verdad, verdadPose: { pos: p.pos, q: p.q },
          ar: { puntos: ar.puntos.map(q => ({ ...q })), guia: ar.guia, camara: ar.estado().camara, golpe: ar.estado().golpe, suelo: ar.suelo, antes: { tracking: antes.tracking } } });
        document.title = "orden " + o.guia;
      }
      while (est.colaFotos.length && est.colaFotos[0].t <= t){ est.fotos.push({ ...est.colaFotos.shift(), real: t, listo: false }); }
      // lo que se ve en pantalla: dónde dibuja 8th Wall cada punto frente a dónde debería estar
      if (nFrames % 6 === 0 && est.ordenes.length && ar.puntos.length){
        const k = est.ordenes.length - 1, o = est.ordenes[k];
        const cv2 = ar.renderer.domElement, cw = parseFloat(cv2.style.width) || cv2.clientWidth, ch = parseFloat(cv2.style.height) || cv2.clientHeight;
        const n = Math.min(ar.puntos.length, o.verdad.puntos.length);
        for (const i of new Set([0, n >> 1, n - 1])){
          const pa = ar.puntos[i], pv = o.verdad.puntos[i];
          if (!pa || !pv) continue;
          const a = ar.aPantalla([pa.x, pa.y + ar.suelo, pa.z]);
          const v = new THREE.Vector3(pv.x, pv.y, pv.z).project(camT);
          const uvT = [(v.x + 1) / 2, (1 - v.y) / 2], uvA = [a.x / cw, a.y / ch];
          const dentro = u => u[0] > 0.02 && u[0] < 0.98 && u[1] > 0.02 && u[1] < 0.98;
          if (a.z < 1 && v.z < 1 && dentro(uvT) && dentro(uvA))
            est.pix.push({ t, o: k, i, ar: uvA, v: uvT, dx: (uvA[0] - uvT[0]) * cw, dy: (uvA[1] - uvT[1]) * ch });
        }
      }
      // muestra para el ajuste: verdad vs lo que cree 8th Wall
      if (ar.iniciado){
        const e = ar.estado();
        if (e.camara) est.muestras.push({ t, v: { pos: p.pos, q: p.q, psi: p.psi }, x: { pos: e.camara.pos, q: e.camara.q }, trk: e.tracking, fps: e.fps });
      }
      if (t >= duracion && !est.terminado){ est.terminado = true; est.corriendo = false; }
    }
  }
  const bucle = setInterval(tick, 1000 / 30);

  const api = {
    nombre, h, fov, duracion, esc, limites, stream, ordenes, fotos,
    estado: () => ({ t: tScript(), corriendo: est.corriendo, terminado: est.terminado, nOrdenes: est.ordenes.length, nFotos: est.fotos.length, fotosListas: est.fotos.filter(f => f.listo).length, muestras: est.muestras.length }),
    iniciar(){ est.t0 = performance.now(); est.corriendo = true; },
    datos: () => ({ nombre, h, fov, lente, zoomLente: LENTES[lente].zoom, duracion, ordenes: est.ordenes, muestras: est.muestras, pix: est.pix,
      lienzo: { w: parseFloat(ar.renderer.domElement.style.width), h: parseFloat(ar.renderer.domElement.style.height), px: [ar.renderer.domElement.width, ar.renderer.domElement.height], vista: document.body.dataset.vista, fovV: ar.fovVertical(), video: ar.video }, fotos: est.fotos, camH: ar.op.camH, offset: ar.op.offsetCamara, paso: ar.op.paso }),
    fotoLista(nombreFoto){ const f = est.fotos.find(f => f.nombre === nombreFoto); if (f) f.listo = true; },
    pendientesFoto: () => est.fotos.filter(f => !f.listo).map(f => f.nombre),
    pose, rCam, camV,
    detener(){ clearInterval(bucle); },
  };
  return api;
}
