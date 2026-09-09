/**
 * ============================================================================
 *  FloorLogos — logos institucionales apoyados en el suelo
 * ============================================================================
 *  Dos planos horizontales a ras del suelo (y = 0 en el espacio de referencia
 *  `local-floor` de WebXR, que coincide con el suelo real de la habitación).
 *  Se colocan delante del usuario al recentrar la escena, igual que el sistema
 *  solar, de modo que quedan siempre a la vista sin estorbar.
 *
 *  Los archivos son OPCIONALES: si alguno falta, ese logo sencillamente no
 *  aparece y se avisa por consola, sin romper la aplicación.
 * ============================================================================
 */

import * as THREE from 'three';

/** Rutas relativas a `public/`. Añadir o quitar entradas es seguro. */
export const LOGO_FILES = [
  // gti-fiuner.png es cuadrado (1:1); uner-fi.png es apaisado (3:1). Los anchos
  // están elegidos para que ambos tengan un peso visual parecido en el suelo.
  { file: 'logos/gti-fiuner.png', widthM: 0.34 },
  { file: 'logos/uner-fi.png', widthM: 0.70 }
];

const SEPARATION = 0.14;   // hueco (m) entre los dos logos
const FLOOR_Y = 0.012;     // ligeramente sobre el suelo, para evitar z-fighting

export class FloorLogos {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'floor-logos';
    this.group.visible = false;    // hasta que cargue al menos uno

    /** @type {{mesh: THREE.Mesh, widthM: number, aspect: number}[]} */
    this.items = [];
    this._loaded = 0;

    const loader = new THREE.TextureLoader();
    // `import.meta.env.BASE_URL` respeta el despliegue en subcarpetas
    const base = import.meta.env.BASE_URL || './';

    LOGO_FILES.forEach((cfg, i) => {
      loader.load(
        base + cfg.file,
        (tex) => this._onLoaded(tex, cfg, i),
        undefined,
        () => console.warn(
          `[FloorLogos] No se encontró "${cfg.file}". ` +
          'Colocá el archivo en public/logos/ para que aparezca en el suelo.'
        )
      );
    });
  }

  _onLoaded(tex, cfg, index) {
    const img = tex.image;
    const aspect = (img && img.height) ? img.width / img.height : 1;
    const h = cfg.widthM / aspect;

    const finalTex = this._removeWhiteBackground(img) || tex;
    finalTex.colorSpace = THREE.SRGBColorSpace;
    finalTex.anisotropy = 4;

    const mat = new THREE.MeshBasicMaterial({
      map: finalTex,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.widthM, h), mat);
    mesh.rotation.x = -Math.PI / 2;      // tumbado sobre el suelo
    mesh.renderOrder = -2;               // por debajo de todo lo demás
    mesh.userData.logoIndex = index;

    this.group.add(mesh);
    this.items.push({ mesh, widthM: cfg.widthM, aspect });
    this.group.visible = true;
    this._layout();
  }

  /**
   * Los logos institucionales suelen venir en PNG con FONDO BLANCO OPACO. Sobre
   * el suelo real del passthrough eso se vería como una hoja de papel pegada,
   * así que el blanco se convierte en transparencia.
   *
   * No es un recorte duro: la opacidad decrece de forma gradual entre el 82 % y
   * el 99 % de luminosidad mínima, de modo que los bordes suavizados del logo
   * conservan su antialias y no quedan dentados.
   *
   * @returns {THREE.CanvasTexture|null} null si la imagen no se puede procesar
   */
  _removeWhiteBackground(img) {
    if (!img || !img.width) return null;
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;

      // Si el PNG YA trae fondo transparente no se toca nada: recortar el
      // blanco borraría los blancos legítimos del propio logo (los reflejos de
      // las gafas, los huecos del engranaje...). Se comprueba mirando las
      // cuatro esquinas, que es donde vive el fondo.
      const esquinas = [
        0,
        (c.width - 1) * 4,
        (c.height - 1) * c.width * 4,
        ((c.height - 1) * c.width + c.width - 1) * 4
      ];
      if (esquinas.every((i) => d[i + 3] < 16)) {
        return new THREE.CanvasTexture(c);
      }

      for (let i = 0; i < d.length; i += 4) {
        // Un píxel es "blanco" cuando su canal MÁS OSCURO ya es claro; así los
        // azules y grises del logo (que tienen algún canal bajo) se conservan.
        const min = Math.min(d[i], d[i + 1], d[i + 2]) / 255;
        const t = Math.min(1, Math.max(0, (min - 0.82) / (1 - 0.82 - 0.01)));
        const k = t * t * (3 - 2 * t);          // suavizado
        d[i + 3] = Math.round(d[i + 3] * (1 - k));
      }
      ctx.putImageData(data, 0, 0);
      return new THREE.CanvasTexture(c);
    } catch (err) {
      console.warn('[FloorLogos] No se pudo recortar el fondo del logo:', err);
      return null;
    }
  }

  /** Reparte los logos en fila, centrados respecto del origen del grupo. */
  _layout() {
    const total = this.items.reduce((acc, it) => acc + it.widthM, 0)
      + SEPARATION * Math.max(0, this.items.length - 1);
    let x = -total / 2;
    for (const it of this.items) {
      it.mesh.position.set(x + it.widthM / 2, FLOOR_Y, 0);
      x += it.widthM + SEPARATION;
    }
  }

  /**
   * Coloca los logos en el suelo, delante del usuario.
   * @param {THREE.Vector3} userPos   posición de la cabeza
   * @param {THREE.Vector3} forward   dirección de la mirada (horizontal, unitaria)
   * @param {number} distance         metros por delante del usuario
   */
  placeInFrontOf(userPos, forward, distance = 1.15) {
    this.group.position.set(
      userPos.x + forward.x * distance,
      0,
      userPos.z + forward.z * distance
    );
    // Se giran para quedar legibles desde la posición del usuario
    this.group.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI;
  }

  setVisible(v) {
    this.group.visible = v && this.items.length > 0;
  }

  dispose() {
    for (const it of this.items) {
      it.mesh.geometry.dispose();
      if (it.mesh.material.map) it.mesh.material.map.dispose();
      it.mesh.material.dispose();
    }
  }
}
