// 8th Wall + three.js: pone en el suelo los puntos que le manden.
//
// Es la lógica de Terrain AR sin su proyecto: escala `responsive`, la cámara
// arranca a CAM_H sobre el suelo, el suelo es el plano y = 0 y el «raycast» es
// un rayo cámara → plano. Nada de calibrar el SLAM antes de ver algo.
//
// Este módulo NO decide hacia dónde ir. Recibe una guía (tramos con giro y
// número de puntos) y la dibuja anclada al mundo del SLAM.
import {
  rumboCamara, direccionCamara, planoRayo, haciaCamara, trazar,
} from "./ar-guia.js";

export const OPCIONES = {
  camH: 1.4,            // altura a la que se supone el móvil al arrancar (el origen.y del mundo)
  paso: 0.5,            // separación entre puntos
  hueco: 1.0,           // distancia al primer punto cuando se coloca «desde los pies»
  offsetCamara: 0.6,    // CAMERA_OFFSET de Terrain AR: el impacto, acercado a la cámara
  radioPunto: 0.09,
  maxPuntos: 80,
  colorPunto: 0x27e0b0,
  colorAnillo: 0xffbb44,
  distanciaMaxima: 12,  // el rayo más allá de esto no cuenta
};

export class ArGuia {
  constructor(THREE, opciones = {}){
    this.THREE = THREE;
    // una opción en undefined NO pisa el valor por defecto
    this.op = { ...OPCIONES, ...Object.fromEntries(Object.entries(opciones).filter(([, v]) => v !== undefined)) };
    this.scene = null; this.camera = null; this.renderer = null;
    this.floorAjuste = 0;           // el «ajuste de altura» manual, en unidades
    this.tracking = "INITIALIZING";
    this.fps = 0;
    this.modo = "pies";             // de dónde arranca el trazado: pies | rayo
    this.mostrarAnillo = true;
    this.mostrarRejilla = false;
    this.guia = null;               // la última guía colocada
    this.puntos = [];               // sus puntos, en coordenadas del mundo
    this.golpe = null;              // último impacto del rayo (con offset)
    this.alActualizar = null;       // callback por fotograma, para la interfaz
    this.errores = [];
    this._t = 0; this._n = 0;
  }

  get suelo(){ return this.floorAjuste; }

  // ------------------------------------------------------------ arranque
  /**
   * Engancha todo el pipeline y lanza XR8. `permitir` = XR8.XrConfig.device().ANY
   * en escritorio (la simulación); en el móvil se deja el valor por defecto.
   */
  iniciar(canvas, { permitirCualquierDispositivo = false } = {}){
    const XR8 = window.XR8;
    XR8.XrController.configure({ disableWorldTracking: false, scale: "responsive" });
    XR8.addCameraPipelineModules([
      this._moduloErrores(),
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      this._moduloAR(),
    ]);
    const cfg = { canvas };
    if (permitirCualquierDispositivo) cfg.allowedDevices = XR8.XrConfig.device().ANY;
    XR8.run(cfg);
  }

  _moduloErrores(){
    return {
      name: "errores",
      onException: err => {
        this.errores.push(String(err?.message || err));
        console.error("[ar]", err);
        this.alError?.(err);
      },
      onCameraStatusChange: ({ status }) => {
        this.camara = status;
        if (status === "failed") this.alError?.(new Error("Cámara denegada o no disponible"));
      },
    };
  }

  _moduloAR(){
    const THREE = this.THREE;
    return {
      name: "ar-guia",
      onStart: () => {
        const xr = window.XR8.Threejs.xrScene();
        this.scene = xr.scene; this.camera = xr.camera; this.renderer = xr.renderer;
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223333, 2.4));

        // El origen se fija UNA vez, antes de que el usuario se mueva. En
        // `responsive` la y del origen es la escala del mundo: la cámara arranca
        // a camH sobre el plano y = 0.
        this.camera.position.set(0, this.op.camH, 0);
        if (!this.op.sinOrigen){
          window.XR8.XrController.updateCameraProjectionMatrix({
            origin: { x: 0, y: this.op.camH, z: 0 },
            facing: { x: 0, y: 0, z: 0, w: 1 },
          });
        }

        // el anillo: el raycast al plano, a ras de suelo, con el offset
        this.anillo = new THREE.Mesh(
          new THREE.RingGeometry(0.11, 0.15, 32).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: this.op.colorAnillo, transparent: true,
                                        opacity: 0.9, depthTest: false }));
        this.anillo.renderOrder = 3; this.anillo.visible = false;
        this.scene.add(this.anillo);

        // los puntos
        const geo = new THREE.CircleGeometry(this.op.radioPunto, 24).rotateX(-Math.PI / 2);
        this.meshes = [];
        for (let i = 0; i < this.op.maxPuntos; i++){
          const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: this.op.colorPunto, transparent: true, opacity: 0.95, depthTest: false }));
          m.renderOrder = 1; m.visible = false;
          this.scene.add(m); this.meshes.push(m);
        }
        // la flecha del final, tumbada en el suelo
        this.flecha = new THREE.Mesh(
          new THREE.ConeGeometry(0.13, 0.36, 3).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: this.op.colorPunto, depthTest: false }));
        this.flecha.renderOrder = 2; this.flecha.visible = false;
        this.scene.add(this.flecha);

        // una rejilla de 1 m, para ver si el plano se pega al suelo al caminar
        this.rejilla = new THREE.GridHelper(20, 20, 0xffffff, 0x88aaff);
        this.rejilla.material.transparent = true; this.rejilla.material.opacity = 0.35;
        this.rejilla.material.depthTest = false; this.rejilla.renderOrder = 0;
        this.rejilla.visible = false;
        this.scene.add(this.rejilla);

        this.iniciado = true;
        this.alIniciar?.();
      },

      onUpdate: ({ processCpuResult }) => {
        const st = processCpuResult?.reality?.trackingStatus;
        if (st) this.tracking = st;
        this.motivo = processCpuResult?.reality?.trackingReason ?? this.motivo;
        this._actualizar();
      },
    };
  }

  // ------------------------------------------------------------ por fotograma
  _poseCamara(){
    const c = this.camera, q = c.quaternion;
    return { pos: [c.position.x, c.position.y, c.position.z], q: [q.x, q.y, q.z, q.w] };
  }

  /** El rayo cámara → plano de suelo, con el offset hacia la cámara de Terrain AR. */
  calcularGolpe(){
    if (!this.camera) return null;
    const { pos, q } = this._poseCamara();
    const r = planoRayo(pos, direccionCamara(q), this.suelo);
    if (!r || r.t > this.op.distanciaMaxima) return null;
    const p = haciaCamara(r.p, pos, this.op.offsetCamara);
    return { crudo: r.p, p, distancia: r.t };
  }

  _actualizar(){
    const ahora = performance.now();
    if (this._t){ const dt = ahora - this._t; this.fps = this.fps ? this.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt; }
    this._t = ahora;

    this.golpe = this.calcularGolpe();
    if (this.anillo){
      this.anillo.visible = this.mostrarAnillo && !!this.golpe;
      if (this.golpe) this.anillo.position.set(this.golpe.p[0], this.suelo + 0.01, this.golpe.p[2]);
    }
    if (this.rejilla){
      this.rejilla.visible = this.mostrarRejilla;
      this.rejilla.position.y = this.suelo + 0.005;
    }
    // los puntos siguen el ajuste de altura
    for (let i = 0; i < this.puntos.length; i++) this.meshes[i].position.y = this.puntos[i].y + this.suelo;
    if (this.flecha?.visible && this.puntos.length) this.flecha.position.y = this.puntos.at(-1).y + this.suelo;
    this.alActualizar?.(this.estado());
  }

  // ------------------------------------------------------------ colocar
  /**
   * Coloca una guía: [{ puntos, giro }]. Se ancla al mundo del SLAM en este
   * instante; después los puntos se quedan donde están mientras el usuario camina.
   */
  poner(tramos, { modo = this.modo } = {}){
    if (!this.iniciado) return { ok: false, motivo: "El AR aún no ha arrancado" };
    const { pos, q } = this._poseCamara();
    const rumbo = rumboCamara(q);
    let x = pos[0], z = pos[2], hueco = this.op.hueco;
    if (modo === "rayo"){
      const g = this.calcularGolpe();
      if (!g) return { ok: false, motivo: "No hay suelo a la vista: apunta hacia abajo" };
      x = g.p[0]; z = g.p[2]; hueco = 0;
    }
    const t = trazar({ x, z, rumbo, tramos, hueco, paso: this.op.paso, y: 0.02 });
    const lista = t.puntos.slice(0, this.op.maxPuntos);
    this.guia = { tramos, modo, rumbo, origen: { x, z }, cuando: performance.now(), ajusteAlColocar: this.suelo };
    this.puntos = lista;
    this.meshes.forEach((m, i) => {
      const p = lista[i];
      m.visible = !!p;
      if (p){
        m.position.set(p.x, p.y + this.suelo, p.z);
        m.material.opacity = Math.max(0.35, 0.95 - i * 0.012);
        m.material.color.setHex(this.op.colorPunto);
      }
    });
    const f = this.flecha;
    if (lista.length){
      const ult = lista.at(-1);
      f.visible = true;
      f.position.set(ult.x, ult.y + this.suelo, ult.z);
      f.rotation.y = -ult.rumbo;
      // un pelín por delante del último punto
      f.position.x += Math.sin(ult.rumbo) * 0.35; f.position.z += -Math.cos(ult.rumbo) * 0.35;
    } else f.visible = false;
    return { ok: true, puntos: lista.length, rumbo };
  }

  limpiar(){
    this.puntos = []; this.guia = null;
    this.meshes?.forEach(m => { m.visible = false; });
    if (this.flecha) this.flecha.visible = false;
  }

  ajustarSuelo(v){ this.floorAjuste = v; }

  // ------------------------------------------------------------ estado
  estado(){
    const pose = this.camera ? this._poseCamara() : null;
    return {
      iniciado: !!this.iniciado, tracking: this.tracking, motivo: this.motivo, fps: this.fps,
      camara: pose, suelo: this.suelo, camH: this.op.camH,
      alto: pose ? pose.pos[1] - this.suelo : null,
      golpe: this.golpe, puntos: this.puntos.length, guia: this.guia,
      modo: this.modo, errores: this.errores,
    };
  }

  /** Proyecta un punto del mundo a píxeles CSS del lienzo (para comparar con la verdad). */
  aPantalla(p){
    const THREE = this.THREE;
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const c = this.renderer.domElement;
    const w = parseFloat(c.style.width) || c.clientWidth, h = parseFloat(c.style.height) || c.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z };
  }
}
