// Núcleo del AR: de «10 puntos al frente, 4 en diagonal derecha» a posiciones
// sobre el suelo. No sabe nada de 8th Wall ni de three.js: recibe números y
// devuelve números, así que se prueba en node (pruebas/guia.test.mjs).
//
// Quien decide hacia dónde ir (el motor del mapa, el giroscopio, el VPS...) manda
// una GUÍA; este módulo solo la dibuja bien.
//
// ── Marco del mundo ─────────────────────────────────────────────────────────
// El mismo que usa three.js y 8th Wall:   X = derecha/este,  Y = arriba,
// Z = hacia atrás/sur.  La cámara mira a −Z con la orientación identidad.
//
// RUMBO ψ (radianes): 0 mira a −Z, y crece en sentido horario visto desde
// arriba, de modo que +X es ψ = 90°.  Avanzar un paso con rumbo ψ es:
//        (dx, dz) = (sin ψ, −cos ψ)
// GIRO positivo = a la derecha.

export const RAD = Math.PI / 180;

/** Direcciones con nombre → giro en grados respecto al tramo anterior. */
export const DIRECCIONES = {
  adelante: 0, frente: 0, recto: 0,
  diagder: 45, diagonalderecha: 45,
  derecha: 90,
  atras: 180,
  diagizq: -45, diagonalizquierda: -45,
  izquierda: -90,
};

export const avance = psi => [Math.sin(psi), -Math.cos(psi)];
export const rumboDeDir = (dx, dz) => Math.atan2(dx, -dz);

/** Lleva un ángulo a (−π, π]. */
export const envolver = a => {
  const r = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  return r <= -Math.PI + 1e-12 ? r + 2 * Math.PI : r;
};

// ── Cámara ──────────────────────────────────────────────────────────────────
/** Rota el vector v con el cuaternión q = [x, y, z, w]. */
export function rotar(q, v){
  const [qx, qy, qz, qw] = q, [x, y, z] = v;
  // t = 2 · (q.xyz × v);  v' = v + w·t + q.xyz × t
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Hacia dónde mira la cámara, en el suelo. */
export const direccionCamara = q => rotar(q, [0, 0, -1]);

/**
 * Rumbo de la cámara. Si mira casi al horizonte vale el eje de visión. Si apunta
 * muy abajo (lo normal para ver el suelo), la proyección del eje de visión es
 * ruido y se usa el borde superior del teléfono, que sigue apuntando hacia
 * delante.
 */
export function rumboCamara(q){
  const f = direccionCamara(q);
  const h = Math.hypot(f[0], f[2]);
  if (h > 0.35) return rumboDeDir(f[0], f[2]);
  const u = rotar(q, [0, 1, 0]);
  return rumboDeDir(u[0], u[2]);
}

// ── Suelo ───────────────────────────────────────────────────────────────────
/**
 * Rayo contra el plano y = yPlano. `o` origen, `d` dirección. Es el raycast que
 * hace Terrain AR (`world.raycastFrom` contra la entidad Ground): un plano
 * horizontal, sin detectar superficies.
 */
export function planoRayo(o, d, yPlano = 0){
  if (Math.abs(d[1]) < 1e-9) return null;
  const t = (yPlano - o[1]) / d[1];
  if (!(t > 0)) return null;
  return { t, p: [o[0] + d[0] * t, yPlano, o[2] + d[2] * t] };
}

/**
 * El punto del impacto, acercado a la cámara. Es `offsetTowardCamera` de Terrain
 * AR (CAMERA_OFFSET = 0.6): con el impacto lejano, pone la colocación más cerca.
 * No pasa de la cámara.
 */
export function haciaCamara(p, cam, offset = 0.6){
  const dx = cam[0] - p[0], dz = cam[2] - p[2];
  const L = Math.hypot(dx, dz);
  if (L < 1e-4) return [p[0], p[1], p[2]];
  const k = Math.min(offset, L) / L;
  return [p[0] + dx * k, p[1], p[2] + dz * k];
}

// ── Trazado ─────────────────────────────────────────────────────────────────
/**
 * Puntos sobre el suelo a partir de una guía de tramos.
 *
 *   tramos: [{ puntos, giro }]   giro en grados, + a la derecha, respecto al
 *                                tramo anterior (el primero, respecto a `rumbo`)
 *   x, z, rumbo                  dónde se está y hacia dónde se mira (rad)
 *   hueco                        distancia al primer punto (m)
 *   paso                         separación entre puntos (m)
 *   y                            altura de los puntos (un poco sobre el suelo)
 *
 * Los puntos de un tramo nuevo siguen desde el último del anterior, así que el
 * giro se ve como una esquina entre dos puntos, no como un salto.
 */
export function trazar({ x, z, rumbo, tramos, hueco = 1.0, paso = 0.5, y = 0.02 }){
  const puntos = [];
  const rumbos = [];
  let psi = rumbo;
  let px = x, pz = z;
  let primero = true;
  tramos.forEach((t, k) => {
    psi += (t.giro || 0) * RAD;
    rumbos.push(psi);
    const [dx, dz] = avance(psi);
    for (let i = 0; i < t.puntos; i++){
      const d = primero ? hueco + i * paso : paso;
      px += dx * d; pz += dz * d;
      puntos.push({ x: px, y, z: pz, tramo: k, rumbo: psi });
      primero = false;
    }
  });
  return { puntos, rumbos, fin: { x: px, z: pz, rumbo: psi } };
}

/** Puntos equiespaciados a lo largo de una polilínea [{x, z}] (p. ej. una ruta). */
export function trazarRuta(poli, { paso = 0.5, y = 0.02, maximo = 60 } = {}){
  const puntos = [];
  let resto = 0;
  for (let i = 0; i < poli.length - 1 && puntos.length < maximo; i++){
    const a = poli[i], b = poli[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    const psi = rumboDeDir(dx, dz);
    for (let s = resto; s < L && puntos.length < maximo; s += paso){
      puntos.push({ x: a.x + dx * s / L, y, z: a.z + dz * s / L, tramo: i, rumbo: psi });
      resto = s + paso - L;
    }
  }
  return { puntos };
}

// ── Texto → guía ────────────────────────────────────────────────────────────
const limpiar = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[.\-_\s]/g, "");

/**
 * «10 adelante, 4 diag der, 3 izquierda» → [{puntos:10,giro:0},{puntos:4,giro:45},...]
 * También vale un ángulo: «5 +30», «5 -20°», o el orden inverso «derecha 3».
 * Devuelve null si algún trozo no se entiende.
 */
export function parsearGuia(texto){
  const trozos = String(texto).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  if (!trozos.length) return null;
  const tramos = [];
  for (const raw of trozos){
    const m = raw.match(/\d+/);
    if (!m) return null;
    const puntos = parseInt(m[0], 10);
    const resto = raw.replace(m[0], " ");
    let giro = null;
    const ang = resto.match(/([+-]\s*\d+(?:\.\d+)?)\s*°?/);
    if (ang) giro = parseFloat(ang[1].replace(/\s/g, ""));
    else {
      const palabra = limpiar(resto.replace(/[°]/g, ""));
      if (palabra === "") giro = 0;
      else if (palabra in DIRECCIONES) giro = DIRECCIONES[palabra];
    }
    if (giro === null || puntos < 1) return null;
    tramos.push({ puntos, giro });
  }
  return tramos;
}

export const textoDeGuia = tramos => tramos.map(t => {
  const nombre = Object.entries(DIRECCIONES).find(([n, g]) => g === t.giro && !["frente", "recto", "diagonalderecha", "diagonalizquierda"].includes(n));
  return `${t.puntos} ${nombre ? nombre[0] : (t.giro > 0 ? "+" : "") + t.giro}`;
}).join(", ");
