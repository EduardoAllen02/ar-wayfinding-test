// Qué cámara abre 8th Wall.
//
// 8th Wall pide la cámara «de atrás» con `facingMode` y deja que el navegador
// escoja. En móviles con varios objetivos (gran angular, teleobjetivo...) el
// navegador puede abrir uno de campo muy cerrado, o un recorte del sensor: la
// vista sale ampliada (como un zoom 3x) y el motor, que supone un campo normal
// (~65°), calcula mal la escala y la altura del suelo.
//
// Aquí se deja elegir el objetivo y la resolución con miniaturas reales, y un
// envoltorio de getUserMedia fuerza esa elección en lo que pida 8th Wall.
const CLAVE = "camaraElegida";

/**
 * Reescribe las restricciones de vídeo con la cámara y la resolución elegidas.
 * Pura: se prueba en node. Sin preferencia, devuelve las restricciones tal cual.
 */
export function reescribirRestricciones(c, pref){
  if (!c || !c.video || !pref || (!pref.id && !pref.w)) return c;
  const v = typeof c.video === "object" ? { ...c.video } : {};
  if (pref.id){
    v.deviceId = { exact: pref.id };
    delete v.facingMode;                       // con un deviceId concreto sobra y puede chocar
  }
  if (pref.w && pref.h){
    v.width = { ideal: Math.max(pref.w, pref.h) };     // en apaisado; el navegador lo gira solo
    v.height = { ideal: Math.min(pref.w, pref.h) };
  }
  return { ...c, video: v };
}

export function leerPreferencia(){
  try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch { return null; }
}
export function guardarPreferencia(p){
  try { p ? localStorage.setItem(CLAVE, JSON.stringify(p)) : localStorage.removeItem(CLAVE); } catch {}
}

/** Parche a getUserMedia: aplica la preferencia a lo que pida 8th Wall. Se instala una vez. */
export function instalarEnvoltorio(){
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia || md.__envuelto) return;
  const base = md.getUserMedia.bind(md);
  md.__base = base;
  md.__envuelto = true;
  md.getUserMedia = async c => {
    const pref = window.__camPref ?? leerPreferencia();
    const c2 = reescribirRestricciones(c, pref);
    if (c2 === c) return base(c);
    try {
      return await base(c2);
    } catch (e) {
      // la cámara guardada ya no existe, o no admite esa resolución: se usa lo que pidió 8th Wall
      if (e?.name === "OverconstrainedError" || e?.name === "NotFoundError") return base(c);
      throw e;
    }
  };
}

const delante = /front|frontal|user|selfie/i;

/** Las cámaras traseras. Hace falta permiso de cámara para que el navegador dé los nombres. */
export async function listarCamaras(){
  const md = navigator.mediaDevices;
  const abrir = md.__base ?? md.getUserMedia.bind(md);
  let ds = await md.enumerateDevices();
  if (!ds.some(d => d.kind === "videoinput" && d.label)){
    const s = await abrir({ video: true });
    s.getTracks().forEach(t => t.stop());
    ds = await md.enumerateDevices();
  }
  return ds.filter(d => d.kind === "videoinput" && !delante.test(d.label));
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

/** Una foto fija de esa cámara a esa resolución, y lo que el navegador dio de verdad. */
export async function instantanea(id, w, h, { ancho = 150 } = {}){
  const md = navigator.mediaDevices;
  const abrir = md.__base ?? md.getUserMedia.bind(md);
  const pedir = () => abrir({ video: { deviceId: { exact: id }, width: { ideal: Math.max(w, h) }, height: { ideal: Math.min(w, h) } } });
  let stream;
  try { stream = await pedir(); } catch { await dormir(400); stream = await pedir(); }   // algunos móviles tardan en soltar la anterior
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.srcObject = stream;
    await v.play();
    await dormir(700);                                      // deja que la cámara ajuste la exposición
    const t = stream.getVideoTracks()[0];
    const ajustes = t.getSettings?.() ?? {};
    const k = ancho / (v.videoWidth || ancho);
    const c = document.createElement("canvas");
    c.width = Math.round((v.videoWidth || ancho) * k); c.height = Math.round((v.videoHeight || ancho) * k);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return { canvas: c, real: `${v.videoWidth}×${v.videoHeight}`, ajustes, etiqueta: t.label };
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}
