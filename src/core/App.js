/**
 * ============================================================================
 *  App — composición de todos los subsistemas y bucle principal
 * ============================================================================
 *  Orden de actualización por frame (importante):
 *
 *    1. HandTracking      lee las articulaciones de WebXR
 *    2. GestureDetector   deduce el gesto de palma arriba
 *    3. SpatialUI         menú y ficha; marca qué manos están usando la UI
 *    4. PlanetInteraction máquina de estados manos <-> planetas
 *    5. SimulationControls avanza el tiempo simulado (si no está en pausa)
 *    6. SolarSystem       aplica órbitas, rotaciones y transiciones de estado
 *
 *  Los pasos 1-4 usan SIEMPRE delta time real: la velocidad de simulación no
 *  altera la interacción ni la interfaz (requisito §10).
 * ============================================================================
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { CONFIG } from '../config.js';
import { SolarSystem } from '../systems/SolarSystem.js';
import { HandTracking } from '../interaction/HandTracking.js';
import { GestureDetector } from '../interaction/GestureDetector.js';
import { PlanetInteraction } from '../interaction/PlanetInteraction.js';
import { SpatialUI } from '../ui/SpatialUI.js';
import { SimulationControls } from '../sim/SimulationControls.js';
import { XRSessionManager } from './XRSessionManager.js';
import { FloorLogos } from '../systems/FloorLogos.js';
import { AmbientAudio } from '../systems/AmbientAudio.js';
import { ImpactAudio } from '../systems/ImpactAudio.js';
import { SimDateLabel } from '../ui/SimDateLabel.js';
import { PinchIndicator } from '../ui/PinchIndicator.js';

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Nivel del menú (0..1) -> volumen del elemento de audio (ver CONFIG.MUSIC). */
function musicVolume(nivel) {
  return Math.pow(nivel, 1.5);
}

export class App {
  constructor() {
    this.dom = {
      loader: document.getElementById('loader'),
      overlay: document.getElementById('overlay'),
      btnAR: document.getElementById('btn-ar'),
      btnVR: document.getElementById('btn-vr'),
      message: document.getElementById('message'),
      hud: document.getElementById('xr-hud'),
      btnHide: document.getElementById('btn-hide'),
      buildId: document.getElementById('build-id'),
      audioStatus: document.getElementById('audio-status'),
      panelRestore: document.getElementById('panel-restore'),
      caps: {
        secure: document.getElementById('cap-secure'),
        webxr: document.getElementById('cap-webxr'),
        ar: document.getElementById('cap-ar'),
        vr: document.getElementById('cap-vr'),
        hands: document.getElementById('cap-hands')
      }
    };

    this.clock = new THREE.Clock();
    this.pendingRecenter = false;
    this.scaleIndex = CONFIG.DEFAULT_VISUAL_SCALE_INDEX;
    this.orbitScaleIndex = CONFIG.DEFAULT_ORBIT_SCALE_INDEX;
    this.musicIndex = CONFIG.MUSIC.DEFAULT_INDEX;
    this.warnedNoHands = false;
    /** Cámara con la pose real de la cabeza (la XR dentro de la sesión). */
    this._activeCamera = null;
  }

  // =========================================================================
  // Arranque
  // =========================================================================

  async init() {
    this._initRenderer();
    this._initScene();
    this._initSubsystems();
    this._initDesktopPreview();
    this._wireMenu();
    this._wireDOM();

    await this._detectAndReport();

    // Sello de versión: permite distinguir de un vistazo si se está probando
    // la última compilación o una copia antigua servida desde caché.
    if (this.dom.buildId) {
      const version = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '?';
      const sello = (typeof __BUILD_ID__ !== 'undefined') ? __BUILD_ID__ : 'desarrollo';
      this.dom.buildId.textContent = `versión ${version} · ${sello}`;
    }

    this.dom.loader.classList.add('hidden');
    this.renderer.setAnimationLoop((t, frame) => this._frame(t, frame));

    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,                 // imprescindible para el passthrough
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    document.body.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // Fondo transparente: en immersive-ar deja ver la habitación real.
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(
      65, window.innerWidth / window.innerHeight, 0.01, 60
    );
    this.camera.position.set(0, 1.55, 1.6);

    this.system = new SolarSystem();
    this.scene.add(this.system.root);

    // Fecha simulada, flotando sobre el Sol (acompaña al recentrado)
    this.dateLabel = new SimDateLabel();
    this.system.root.add(this.dateLabel.sprite);

    // Logos institucionales apoyados en el suelo real de la habitación
    this.floorLogos = new FloorLogos();
    this.scene.add(this.floorLogos.group);
  }

  _initSubsystems() {
    this.sim = new SimulationControls();
    this.audio = new AmbientAudio('audio/ambient-neptune.mp3',
      musicVolume(CONFIG.MUSIC.STEPS[this.musicIndex]));
    // El estado de la música se ve en el panel y en el menú: si el visor no
    // la reproduce, al menos se sabe por qué.
    this.audio.onStatus = (s) => {
      if (this.dom.audioStatus) this.dom.audioStatus.textContent = `música: ${s}`;
      if (this.ui) this._syncMenuState();
    };
    this.audio.start();
    this.impacts = new ImpactAudio();
    this.system.collisions.onImpact = (A, B, speed, point) => {
      this.impacts.play(speed, A.worldRadius, B.worldRadius, point);
    };
    this.hands = new HandTracking(this.renderer, this.scene);
    this.gestures = new GestureDetector();
    this.interaction = new PlanetInteraction(this.system, this.hands);
    this.pinchIndicator = new PinchIndicator(this.scene);
    this.ui = new SpatialUI(this.scene, this.camera);

    this.interaction.onSelect = (body) => {
      if (body) this.ui.showInfoFor(body);
      else this.ui.hideInfo();
    };

    // Modo comparación: la pinza entrega el cuerpo a la comparación de tamaños
    this.interaction.onComparePick = (body) => this.ui.compare.pick(body);
    this.ui.compare.onClose = () => this._setCompare(false);

    this.ui.info.onClose = () => {
      this.ui.hideInfo();
      this.interaction.clearSelectionSilently();
    };

    // Fijar un cuerpo desde su ficha lo detiene en su sitio; se refleja en el HUD.
    this.ui.info.onPinToggle = (body, pinned) => {
      this._setHud(pinned
        ? `${body.data.name} fijado en su posición`
        : `${body.data.name} vuelve a su órbita`);
    };
  }

  /** Vista de escritorio para desarrollar y probar sin visor. */
  _initDesktopPreview() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CONFIG.SYSTEM_ORIGIN);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 12;
    this.controls.update();

    // NO hay selección con el ratón. La vista de escritorio es sólo para
    // observar la escena y comprobar la simulación: la interacción real es la
    // de las manos en el visor.
    //
    // Se intentó y se quitó. Un planeta rocoso mide 5-7 píxeles de radio con
    // la cámara alejada, así que exigir un impacto exacto hacía imposible
    // acertarle, y cualquier tolerancia acababa seleccionando cuerpos vecinos
    // o los que quedaban de paso. Ninguna de las dos opciones era buena, y en
    // escritorio la ficha no aporta nada que no se pueda ver en el visor.

    // Atajos de teclado (sólo escritorio, para probar sin visor)
    window.addEventListener('keydown', (e) => {
      if (this.renderer.xr.isPresenting) return;
      switch (e.key.toLowerCase()) {
        case 'm': {
          const p = new THREE.Vector3(...CONFIG.SYSTEM_ORIGIN);
          p.y += 0.05;
          p.add(_dir.copy(this.camera.position).sub(p).setY(0).normalize().multiplyScalar(0.55));
          this.ui.toggleMenuAt(p);
          break;
        }
        case 'h': this._togglePanel(); break;
        case 'escape': this._setPanelHidden(true); break;
        case ' ': this._menuAction('toggle-play'); e.preventDefault(); break;
        case 'r': this._menuAction('reset-all'); break;
        case 'o': this._menuAction('toggle-orbits'); break;
        case 'n': this._menuAction('toggle-labels'); break;
        case 'c': this._menuAction('toggle-compare'); break;
      }
    });
  }

  // =========================================================================
  // Menú
  // =========================================================================

  _wireMenu() {
    this._syncMenuState();
    this.ui.menu.onAction = (id) => this._menuAction(id);
  }

  _syncMenuState() {
    this.ui.menu.setState({
      playing: this.sim.playing,
      speeds: this.sim.speeds,
      speedIndex: this.sim.speedIndex,
      showOrbits: this.system.showOrbits,
      showLabels: this.system.showLabels,
      showInfo: this.ui.infoEnabled,
      showStars: this.system.stars.visible,
      allMoons: this.system.showAllMoons,
      audioOn: this.audio ? this.audio.enabled : false,
      collisionsOn: this.system.collisionsEnabled,
      collidersVisible: this.system.collidersVisible,
      impactSoundOn: this.impacts ? this.impacts.enabled : false,
      musicSteps: CONFIG.MUSIC.STEPS,
      musicIndex: this.audio.enabled ? this.musicIndex : 0,
      musicStatus: this.audio.status,
      compareOn: this.ui.compare.active,
      scales: CONFIG.VISUAL_SCALE_STEPS,
      scaleIndex: this.scaleIndex,
      orbitScales: CONFIG.ORBIT_SCALE_STEPS,
      orbitScaleIndex: this.orbitScaleIndex
    });
  }

  _menuAction(id) {
    if (id.startsWith('speed-')) {
      this.sim.setSpeedIndex(parseInt(id.slice(6), 10));
    } else if (id.startsWith('scale-')) {
      this.scaleIndex = parseInt(id.slice(6), 10);
      const bodyScale = CONFIG.VISUAL_SCALE_STEPS[this.scaleIndex];
      this.system.setGlobalScale(bodyScale);
      // Al agrandar los cuerpos, las órbitas se separan lo justo para que los
      // planetas no lleguen a solaparse. La escala base ya deja un 27 % de
      // holgura en el par crítico (Venus-Tierra), así que basta con
      // bodyScale / 1,27 en vez de bodyScale: así el sistema no se aleja más
      // de lo necesario y sigue estando al alcance de la mano.
      const needed = CONFIG.ORBIT_SCALE_STEPS.findIndex((s) => s >= bodyScale / 1.27);
      if (needed > this.orbitScaleIndex) {
        this.orbitScaleIndex = needed;
        this.system.setOrbitScale(CONFIG.ORBIT_SCALE_STEPS[needed]);
      }
    } else if (id.startsWith('music-')) {
      const i = parseInt(id.slice(6), 10);
      const nivel = CONFIG.MUSIC.STEPS[i];
      if (nivel === 0) {
        this.audio.setEnabled(false);
      } else {
        this.musicIndex = i;
        this.audio.setVolume(musicVolume(nivel));
        if (!this.audio.enabled) this.audio.setEnabled(true);
      }
    } else if (id.startsWith('orbit-')) {
      this.orbitScaleIndex = parseInt(id.slice(6), 10);
      this.system.setOrbitScale(CONFIG.ORBIT_SCALE_STEPS[this.orbitScaleIndex]);
    } else {
      switch (id) {
        case 'toggle-play': this.sim.togglePlay(); break;

        case 'reset-all': this._resetAll(); break;

        case 'reset-manipulated':
          // Requisito §10/§18: devolver a su órbita los planetas manipulados
          this.interaction.releaseAll();
          break;

        case 'toggle-orbits': this.system.setOrbitsVisible(!this.system.showOrbits); break;
        case 'toggle-labels': this.system.setLabelsVisible(!this.system.showLabels); break;
        case 'toggle-stars': this.system.setStarsVisible(!this.system.stars.visible); break;

        case 'toggle-audio': this.audio.setEnabled(!this.audio.enabled); break;

        case 'toggle-collisions':
          this.system.setCollisionsEnabled(!this.system.collisionsEnabled);
          break;

        case 'toggle-colliders':
          this.system.setCollidersVisible(!this.system.collidersVisible);
          break;

        case 'toggle-impact-sound':
          this.impacts.unlock();
          this.impacts.setEnabled(!this.impacts.enabled);
          break;

        case 'toggle-compare': this._setCompare(!this.ui.compare.active); break;

        case 'toggle-logos': this.floorLogos.setVisible(!this.floorLogos.group.visible); break;

        case 'toggle-moons':
          // Alterna entre mostrar sólo la Luna o todas las lunas principales
          // (26 satélites reales con sus períodos y distancias verdaderos).
          this.system.setAllMoonsVisible(!this.system.showAllMoons);
          this.system.setOrbitsVisible(this.system.showOrbits);
          this.system.setLabelsVisible(this.system.showLabels);
          break;

        case 'toggle-info':
          this.ui.setInfoEnabled(!this.ui.infoEnabled);
          if (this.ui.infoEnabled && this.interaction.selected) {
            this.ui.showInfoFor(this.interaction.selected);
          }
          break;

        case 'recenter': this.pendingRecenter = true; break;

        case 'close': this.ui.closeMenu(); break;
      }
    }
    this._syncMenuState();
  }

  /**
   * Activa o desactiva la comparación de tamaños. Al activarla se cierran el
   * menú y la ficha para dejar a la vista la escena de comparación.
   */
  _setCompare(v) {
    if (this.ui.compare.active === v) return;
    this.ui.compare.setActive(v, this._activeCamera || this.camera);
    this.interaction.compareMode = v;
    if (v) {
      this.ui.hideInfo();
      this.interaction.clearSelectionSilently(0);
      this.ui.closeMenu();
    }
    this._syncMenuState();
  }

  /**
   * RESET completo (requisito §18):
   *  - suelta lo que haya en las manos y borra transformaciones manuales
   *  - restaura las escalas visuales
   *  - reactiva órbitas y rotaciones
   *  - devuelve el tiempo simulado al instante inicial (J2000)
   *  - cierra la ficha informativa
   */
  _resetAll() {
    this.interaction.releaseAll();
    this.interaction.clearSelectionSilently();
    this.scaleIndex = CONFIG.DEFAULT_VISUAL_SCALE_INDEX;
    this.orbitScaleIndex = CONFIG.DEFAULT_ORBIT_SCALE_INDEX;
    this.sim.resetTime();
    this.sim.play();
    this.system.fullReset(
      CONFIG.VISUAL_SCALE_STEPS[this.scaleIndex],
      CONFIG.ORBIT_SCALE_STEPS[this.orbitScaleIndex]
    );
    this.system.setOrbitsVisible(true);
    this.system.setLabelsVisible(true);
    this.ui.hideInfo();
    this._setCompare(false);
    // Recolocamos los cuerpos en su posición orbital de t = 0 inmediatamente
    this.system.update(0, 0, this.sim.simDays);
  }

  // =========================================================================
  // WebXR
  // =========================================================================

  _wireDOM() {
    this.xr = new XRSessionManager();

    this.xr.onWarning = (msg) => this._setMessage(msg, false);

    this.xr.onSessionStart = (session, mode) => {
      this.dom.overlay.classList.add('in-session');
      this.pendingRecenter = true;
      this.controls.enabled = false;

      // En VR no hay passthrough: se pinta un fondo espacial oscuro para que
      // el sistema solar tenga contraste (en AR el fondo queda transparente).
      this.scene.background = (mode === 'immersive-vr')
        ? new THREE.Color(0x03050c) : null;

      this.renderer.xr.setFoveation(CONFIG.RENDER.FOVEATION);
      // Entrar en la sesión es una interacción del usuario: el navegador ya
      // permite reproducir audio a partir de aquí.
      this.audio.start();
      this._resetAll();
    };

    this.xr.onSessionEnd = () => {
      this.dom.overlay.classList.remove('in-session');
      this.controls.enabled = true;
      this.scene.background = null;
      this.interaction.releaseAll();
      this.ui.closeMenu();
    };

    this.dom.btnAR.addEventListener('click', () => this._enter('immersive-ar'));
    this.dom.btnVR.addEventListener('click', () => this._enter('immersive-vr'));

    // El panel de estado es útil pero tapa la escena en el escritorio: se
    // puede plegar a una pastilla en la esquina y recuperar cuando haga falta.
    this.dom.btnHide.addEventListener('click', () => this._setPanelHidden(true));
    this.dom.panelRestore.addEventListener('click', () => this._setPanelHidden(false));
  }

  _setPanelHidden(hidden) {
    this.dom.overlay.classList.toggle('panel-hidden', hidden);
  }

  _togglePanel() {
    this._setPanelHidden(!this.dom.overlay.classList.contains('panel-hidden'));
  }

  async _enter(mode) {
    try {
      this._setMessage('', false);
      // Dentro del gesto del clic: único momento en que se puede crear audio
      this.impacts.unlock();
      const session = await this.xr.requestSession(mode, this.dom.overlay);
      await this.renderer.xr.setSession(session);
    } catch (err) {
      this._setMessage(err.message || String(err), true);
      console.error(err);
    }
  }

  async _detectAndReport() {
    const caps = await this.xr.detectCapabilities();
    const set = (el, cls, text) => {
      el.className = cls;
      if (text) el.lastElementChild.textContent = text;
    };

    set(this.dom.caps.secure, caps.secureContext ? 'ok' : 'err',
      caps.secureContext ? 'Contexto seguro (HTTPS) — correcto'
        : 'Contexto NO seguro: WebXR requiere HTTPS o localhost');
    set(this.dom.caps.webxr, caps.webxr ? 'ok' : 'err',
      caps.webxr ? 'API WebXR disponible' : 'API WebXR no disponible en este navegador');
    set(this.dom.caps.ar, caps.ar ? 'ok' : 'err',
      caps.ar ? 'immersive-ar (passthrough / MR) soportado'
        : 'immersive-ar NO soportado en este dispositivo');
    set(this.dom.caps.vr, caps.vr ? 'ok' : 'warn',
      caps.vr ? 'immersive-vr disponible como alternativa' : 'immersive-vr no disponible');
    set(this.dom.caps.hands, 'warn',
      'Hand tracking: se verifica al entrar en la sesión');

    this.dom.btnAR.disabled = !caps.ar;
    this.dom.btnVR.style.display = caps.vr ? '' : 'none';
    if (!caps.ar && caps.vr) this.dom.btnVR.className = 'primary';

    const msg = this.xr.explainUnavailability();
    if (msg) this._setMessage(msg, !caps.ar && !caps.vr);
  }

  _setMessage(text, isError) {
    this.dom.message.textContent = text || '';
    this.dom.message.className = isError ? 'error' : '';
  }

  _setHud(text) {
    if (this.dom.hud.textContent !== text) this.dom.hud.textContent = text;
  }

  /** Coloca el sistema solar alrededor del usuario según su pose actual. */
  _recenter(cam, presenting = false) {
    cam.getWorldPosition(_v);
    // Si la cámara XR aún no tiene pose válida, se reintenta el frame siguiente
    if (presenting && _v.lengthSq() < 1e-8) return;

    cam.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1);
    _dir.normalize();

    // El Sol queda ligeramente por delante y por debajo de la cabeza, de modo
    // que el sistema rodea al usuario sin que el Sol le quede "en la cara".
    const origin = _v.clone().addScaledVector(_dir, 0.32);
    origin.y = Math.max(0.85, _v.y - 0.38);
    this.system.root.position.copy(origin);

    // Los logos van en el SUELO (y = 0), por delante del usuario
    this.floorLogos.placeInFrontOf(_v, _dir, 1.15);

    this.pendingRecenter = false;
  }

  // =========================================================================
  // Bucle principal
  // =========================================================================

  _frame(_time, frame) {
    // Delta time real, acotado para que un frame perdido no dé un salto.
    const dtReal = Math.min(0.05, this.clock.getDelta());
    const presenting = this.renderer.xr.isPresenting;
    // Dentro de XR, la cámara de referencia para billboards y recentrado es la
    // ArrayCamera estéreo (tiene la pose real de la cabeza). Al render() se le
    // pasa SIEMPRE la cámara normal: Three.js sustituye internamente por la
    // suya, y pasarle la propia cámara XR la corrompería.
    const activeCamera = presenting ? this.renderer.xr.getCamera() : this.camera;
    this._activeCamera = activeCamera;

    // 1-2) Manos y gestos
    this.hands.update();
    // El gesto del menú se inhibe si la mano derecha está sujetando un cuerpo.
    this.gestures.update(this.hands, dtReal, this.interaction.grabbedBy.right !== null);

    // 3) Interfaz espacial
    this.ui.camera = activeCamera;
    this.ui.update(dtReal, this.hands, this.gestures);

    // 4) Interacción con los planetas (las manos ocupadas con la UI no cuentan)
    this.interaction.blockedHands = this.ui.busyHands;
    this.interaction.update(dtReal);
    this.pinchIndicator.update(this.hands, this.interaction, activeCamera);

    // 5-6) Tiempo y sistema solar
    const dtSimDays = this.sim.step(dtReal);
    this.system.update(dtReal, dtSimDays, this.sim.simDays);

    if (this.audio) this.audio.update(dtReal);
    this.impacts.updateListener(activeCamera);

    this.dateLabel.sprite.position.set(0, this.system.sun.label.position.y + 0.045, 0);
    this.dateLabel.update(dtReal, this.sim.simDays, this.sim.speed, this.sim.playing);

    if (!presenting) this.controls.update();

    this._updateHud(presenting);
    this.renderer.render(this.scene, this.camera);

    // El recentrado va DESPUÉS del render: en el primer frame de la sesión la
    // cámara XR todavía no tiene pose hasta que Three.js la actualiza durante
    // render(). Hacerlo antes colocaría el sistema en el origen.
    if (this.pendingRecenter) this._recenter(activeCamera, presenting);
  }

  _updateHud(presenting) {
    if (!presenting) return;

    if (!this.hands.handTrackingActive) {
      if (!this.warnedNoHands) {
        this._setHud('Sin hand tracking: mostrá las manos a las cámaras o usá los mandos');
      }
      return;
    }
    this.warnedNoHands = true;

    const grabbed = this.interaction.grabbedBy.left || this.interaction.grabbedBy.right;
    if (grabbed) this._setHud(`Sujetando ${grabbed.data.name} — soltá para devolverlo, o lanzalo`);
    else if (this.ui.compare.active) this._setHud('Comparación: pellizcá dos cuerpos');
    else if (this.ui.menu.isVisible) this._setHud('Tocá un botón con la yema del índice');
    else this._setHud('Palma derecha hacia arriba → menú');
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
