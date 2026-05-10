// Game loop, state machine, collision detection, level management.

import { config } from './config';
import { InputState, readInput } from './input';
import {
  ShipState, createShip, updateShip,
  COLLISION_POINTS, GEAR_COLLISION_POINTS, LANDING_GEAR_REST_HEIGHT, localToWorld,
} from './ship';
import { TerrainData, checkLandingCollision as checkTerrainCollision, generateTerrain, landingReferenceHeight, isOnPad } from './terrain';
import { Camera, createCamera, updateCamera, render } from './renderer';
import { drawHUD, GameState, LandingScore, calculateLandingScore, drawLevelSelect, drawPhaseCompleteOverlay } from './hud';
import { createDevPanel, toggleDevPanel, setDevPanelMode } from './dev-panel';
import { LevelDef, landingLevelById, landingLevelByPoiId } from './levels';
import {
  APPROACH_LEVELS, ApproachLevel, ApproachState, ApproachCamera, ApproachInitOverride,
  createApproachState, createApproachCamera, updateApproach,
  updateApproachCamera, renderApproach, drawApproachHUD, approachLevelById,
} from './approach';
import {
  ORBITAL_LEVELS, OrbitalLevel, OrbitalState, OrbitalCamera, OrbitalInitOverride,
  createOrbitalState, createOrbitalCamera, updateOrbital,
  updateOrbitalCamera, renderOrbital, drawOrbitalHUD,
  orbitalLevelById, orbitalToApproachParams, getTransferBody, transferBodyState, currentEscapeVector, fuzzyArrivalStateFromEntry,
} from './orbital';
import {
  DOCKING_LEVELS, DockingLevel, DockingState, DockingCamera, DockingInitOverride,
  createDockingState, createDockingCamera, updateDocking,
  updateDockingCamera, renderDocking, drawDockingHUD,
} from './docking';
import {
  ClusterLevel, ClusterState, ClusterCamera,
  clusterLevelById, createClusterState, createClusterCamera,
  updateCluster, updateClusterCamera, renderCluster, drawClusterHUD,
} from './cluster';
import { MISSIONS } from './missions';
import { bodyById, bodyStateRelativeToParent } from './world';
import { createEstellaNavState, drawEstellaNavigation, estellaNavActivate, estellaNavBack, estellaNavForward, moveEstellaCursor, resetEstellaNavSelection, type EstellaNavPhaseState } from './estella-nav';
import { drawEstellaGeneratedMission, generateEstellaMission, type EstellaGeneratedMissionState } from './estella-mission';
import { createPlayableEstellaMission, generatedEstellaDepartureOrbitDir } from './estella-playable';

const PHYSICS_DT = 1 / 120;
const MAX_FRAME_TIME = 0.1;

type Phase =
  | { kind: 'levelSelect' }
  | { kind: 'landing'; level: LevelDef; ship: ShipState; terrain: TerrainData; camera: Camera; state: GameState; score: LandingScore | null; initOverride?: { x: number; y: number; vx: number; vy: number; facingSign?: 1 | -1 }; launchGuidance?: { targetAltitude: number; orbitDir: 1 | -1; nextApproachLevelId: number }; worldTimeStart: number; missionDvStart: number }
  | { kind: 'approach'; level: ApproachLevel; as: ApproachState; cam: ApproachCamera; state: 'approaching' | 'approachSuccess' | 'approachFailed'; initOverride?: ApproachInitOverride; worldTimeStart: number; missionDvStart: number }
  | { kind: 'orbital'; level: OrbitalLevel; os: OrbitalState; cam: OrbitalCamera; state: 'orbiting' | 'enteredAtmo' | 'crashed' | 'docked'; initOverride?: OrbitalInitOverride; worldTimeStart: number; missionDvStart: number }
  | { kind: 'docking'; level: DockingLevel; ds: DockingState; cam: DockingCamera; state: 'docking' | 'delivered' | 'crashed'; initOverride?: DockingInitOverride; worldTimeStart: number; missionDvStart: number }
  | { kind: 'cluster'; level: ClusterLevel; cs: ClusterState; cam: ClusterCamera; state: 'flying' | 'arrived' | 'crashed'; worldTimeStart: number; missionDvStart: number }
  | { kind: 'estellaNav'; nav: EstellaNavPhaseState }
  | { kind: 'estellaMission'; mission: EstellaGeneratedMissionState };

type GameplayPhase = Exclude<Phase, { kind: 'levelSelect' } | { kind: 'estellaNav' } | { kind: 'estellaMission' }>;

interface PhaseCompletion {
  title: string;
  tone?: 'success' | 'transition';
  phaseDvUsed: number;
  missionDvUsed: number;
  completionText: string;
  ratingText?: string;
  ratingColor?: string;
  detailText?: string;
  onContinue: () => void;
  onRetry: () => void;
}

type TransitionRole = 'success' | 'contingency';

interface PhaseTransition {
  role: TransitionRole;
  title?: string;
  detailText?: string;
  run: () => void;
}

const TOTAL_LEVELS = MISSIONS.length;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private phase: Phase = { kind: 'levelSelect' };
  private accumulator = 0;
  private time = 0;
  private worldTime = 0;
  private lastFrameTime = 0;
  private menuSelection = 0;
  private currentMissionId: number | null = null;
  private guidanceText = '';
  private guidanceUntil = 0;
  private missionDvUsed = 0;
  private phaseCompletion: PhaseCompletion | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    createDevPanel();
  }

  start(): void {
    this.lastFrameTime = performance.now() / 1000;
    requestAnimationFrame(this.loop);
  }

  // --- Level loading ---

  private loadLanding(
    level: LevelDef,
    initOverride?: { x: number; y: number; vx: number; vy: number; facingSign?: 1 | -1 },
    launchGuidance?: { targetAltitude: number; orbitDir: 1 | -1; nextApproachLevelId: number },
    worldTimeStart: number = this.worldTime,
  ): void {
    config.gravity = level.gravity;
    config.landingMaxVSpeed = level.landingMaxVSpeed;
    config.landingMaxHSpeed = level.landingMaxHSpeed;
    config.landingMaxAngle = level.landingMaxAngle;
    const init = initOverride ?? { x: level.startX, y: level.startY, vx: level.startVX, vy: level.startVY };
    config.startX = init.x;
    config.startY = init.y;
    config.startVX = init.vx;
    config.startVY = init.vy;
    const terrain = generateTerrain(level);
    const ship = createShip();
    ship.facingSign = launchGuidance
      ? (launchGuidance.orbitDir > 0 ? 1 : -1)
      : (initOverride?.facingSign ?? 1);
    if (launchGuidance) {
      ship.gearDeployed = true;
      ship.x = level.padCenterX;
      ship.y = landingReferenceHeight(level, terrain, level.padCenterX) + LANDING_GEAR_REST_HEIGHT;
      ship.vx = 0;
      ship.vy = 0;
      ship.angle = 0;
      ship.angularVel = 0;
      ship.throttle = 0;
    }
    const camera = createCamera();
    updateCamera(camera, ship, landingReferenceHeight(level, terrain, ship.x), 0);
    this.phaseCompletion = null;
    this.phase = { kind: 'landing', level, ship, terrain, camera, state: 'flying', score: null, initOverride, launchGuidance, worldTimeStart, missionDvStart: this.missionDvUsed };
    if (launchGuidance) this.showGuidance(`CLIMB TO above ${launchGuidance.targetAltitude.toFixed(0)}m`);
    else this.showGuidance('LAND ON THE PAD');
    setDevPanelMode('landing');
    this.time = 0;
    this.worldTime = worldTimeStart;
    this.accumulator = 0;
  }

  private loadApproach(level: ApproachLevel, initOverride?: ApproachInitOverride, worldTimeStart: number = this.worldTime): void {
    const as = createApproachState(level, initOverride);
    const cam = createApproachCamera(level);
    updateApproachCamera(cam, as, level, 0, this.canvas.width, this.canvas.height);
    this.phaseCompletion = null;
    this.phase = { kind: 'approach', level, as, cam, state: 'approaching', initOverride, worldTimeStart, missionDvStart: this.missionDvUsed };
    if (level.departure) {
      const dir = level.departure.orbitDir === -1 ? 'LEFT' : 'RIGHT';
      this.showGuidance(`CLIMB to ${(level.departure.exitAltitude / 1000).toFixed(1)}km and ACCELERATE ${dir}`);
    } else {
      this.showGuidance('ARRIVE AT TARGET AREA');
    }
    setDevPanelMode('approach', () => this.loadApproach(level, initOverride, worldTimeStart));
    this.time = 0;
    this.worldTime = worldTimeStart;
    this.accumulator = 0;
  }

  private loadDocking(level: DockingLevel, initOverride?: DockingInitOverride, worldTimeStart: number = this.worldTime): void {
    const ds = createDockingState(level, initOverride);
    const cam = createDockingCamera();
    updateDockingCamera(cam, ds, level, 0, this.canvas.width, this.canvas.height);
    this.phaseCompletion = null;
    this.phase = { kind: 'docking', level, ds, cam, state: 'docking', initOverride, worldTimeStart, missionDvStart: this.missionDvUsed };
    this.showGuidance(level.exitMode ? 'CLEAR THE STATION' : 'DELIVER TO TARGET BAY');
    this.time = 0;
    this.worldTime = worldTimeStart;
    this.accumulator = 0;
  }

  private loadCluster(level: ClusterLevel, worldTimeStart: number = this.worldTime): void {
    const cs = createClusterState(level);
    const cam = createClusterCamera(level);
    updateClusterCamera(cam, cs, level, 0, this.canvas.width, this.canvas.height);
    this.phaseCompletion = null;
    this.phase = { kind: 'cluster', level, cs, cam, state: 'flying', worldTimeStart, missionDvStart: this.missionDvUsed };
    this.showGuidance('LOCAL TRAFFIC: FLY TO ASSIGNED BERTH');
    this.time = 0;
    this.worldTime = worldTimeStart;
    this.accumulator = 0;
  }

  private loadEstellaNavigation(): void {
    this.phaseCompletion = null;
    this.phase = { kind: 'estellaNav', nav: createEstellaNavState() };
    this.showGuidance('SELECT ESTELLA SOURCE AND DESTINATION');
    this.time = 0;
    this.accumulator = 0;
  }

  private loadOrbital(level: OrbitalLevel, initOverride?: OrbitalInitOverride, worldTimeStart: number = this.worldTime): void {
    const effectiveInit = initOverride ? { ...initOverride, time: initOverride.time ?? worldTimeStart } : { x: level.startX, y: level.startY, vx: level.startVX, vy: level.startVY, time: worldTimeStart };
    const os = createOrbitalState(level, effectiveInit);
    const cam = createOrbitalCamera(level);
    if (initOverride) {
      if (level.systemBodies) {
        // Escapes into a parent/system transfer frame should start in the transfer map view,
        // not briefly inherit a ship-centered local camera from the child SOI.
        updateOrbitalCamera(cam, os, level, 10, this.canvas.width, this.canvas.height);
      } else {
        cam.x = os.x;
        cam.y = os.y;
      }
    }
    this.phaseCompletion = null;
    this.phase = { kind: 'orbital', level, os, cam, state: 'orbiting', initOverride: effectiveInit, worldTimeStart, missionDvStart: this.missionDvUsed };
    const guidance = level.station ? 'RENDEZVOUS WITH TARGET'
      : level.targetBodyId ? 'INTERCEPT TARGET BODY'
      : level.escapeSOIRadius ? 'ESCAPE TOWARD TARGET'
      : (level.showLandingSite === false ? 'MAINTAIN ORBITAL OBJECTIVE' : 'DEORBIT AND LAND NEAR THE LZ');
    this.showGuidance(guidance);
    this.time = 0;
    this.worldTime = worldTimeStart;
    this.accumulator = 0;
  }

  private showGuidance(text: string, duration = 4): void {
    this.guidanceText = text;
    this.guidanceUntil = performance.now() / 1000 + duration;
  }

  private drawGuidanceBanner(): void {
    const now = performance.now() / 1000;
    if (!this.guidanceText || now > this.guidanceUntil) return;
    const W = this.canvas.width;
    this.ctx.save();
    this.ctx.font = 'bold 18px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#00ffcc';
    this.ctx.fillText(this.guidanceText, W / 2, 30);
    this.ctx.restore();
  }

  // --- Main loop ---

  private loop = (): void => {
    const now = performance.now() / 1000;
    let frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

    const input = readInput();

    if (input.toggleDevPanel) toggleDevPanel();

    if (this.phaseCompletion) {
      if (input.reset) this.phaseCompletion.onRetry();
      else if (input.continueAction) this.phaseCompletion.onContinue();
      this.renderFrame();
      requestAnimationFrame(this.loop);
      return;
    }

    const p = this.phase;

    if (p.kind === 'levelSelect') {
      this.handleLevelSelect(input);
    } else if (p.kind === 'landing') {
      this.handleLanding(input, frameTime);
    } else if (p.kind === 'approach') {
      this.handleApproach(input, frameTime);
    } else if (p.kind === 'orbital') {
      this.handleOrbital(input, frameTime);
    } else if (p.kind === 'docking') {
      this.handleDocking(input, frameTime);
    } else if (p.kind === 'cluster') {
      this.handleCluster(input, frameTime);
    } else if (p.kind === 'estellaNav') {
      this.handleEstellaNavigation(input);
    } else if (p.kind === 'estellaMission') {
      this.handleEstellaGeneratedMission(input);
    }

    this.renderFrame();
    requestAnimationFrame(this.loop);
  };

  // --- Level select ---

  private handleLevelSelect(input: InputState): void {
    // Arrow/WASD navigation
    if (input.menuUp) this.menuSelection = (this.menuSelection - 1 + TOTAL_LEVELS) % TOTAL_LEVELS;
    if (input.menuDown) this.menuSelection = (this.menuSelection + 1) % TOTAL_LEVELS;

    // Confirm with Enter/Space
    if (input.menuConfirm) {
      this.launchLevel(this.menuSelection);
      return;
    }

    // Direct number key pick (still works)
    if (input.levelPick >= 1 && input.levelPick <= TOTAL_LEVELS) {
      this.menuSelection = input.levelPick - 1;
      this.launchLevel(this.menuSelection);
    }
  }

  private startMission(missionId: number): void {
    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return;
    this.currentMissionId = missionId;
    this.phaseCompletion = null;
    this.missionDvUsed = 0;
    this.worldTime = mission.startWorldTime;
    const start = mission.start;

    if (start.kind === 'docking') {
      const dockingLevel = DOCKING_LEVELS.find(l => l.id === start.dockingLevelId);
      if (dockingLevel) this.loadDocking(dockingLevel);
      return;
    }

    if (start.kind === 'landing') {
      const landingLevel = landingLevelByPoiId(start.poiId);
      const departure = approachLevelById(start.departureApproachLevelId);
      if (!landingLevel || !departure?.departure) return;
      const orbitDir = departure.departure.orbitDir ?? 1;
      this.loadLanding(
        landingLevel,
        { x: landingLevel.padCenterX, y: landingLevel.padY + LANDING_GEAR_REST_HEIGHT, vx: 0, vy: 0 },
        { targetAltitude: landingLevel.startY, orbitDir, nextApproachLevelId: departure.id },
      );
      return;
    }

    if (start.kind === 'cluster') {
      const clusterLevel = clusterLevelById(start.clusterLevelId);
      if (clusterLevel) this.loadCluster(clusterLevel);
      return;
    }

    if (start.kind === 'estellaNav') {
      this.loadEstellaNavigation();
      return;
    }
  }

  private launchLevel(index: number): void {
    const mission = MISSIONS[index];
    if (!mission || mission.stub) return;
    this.startMission(mission.id);
  }

  private phaseDvUsed(p: GameplayPhase): number {
    switch (p.kind) {
      case 'landing': return p.ship.dvUsed;
      case 'approach': return p.as.dvUsed;
      case 'orbital': return p.os.dvUsed;
      case 'docking': return p.ds.dvUsed;
      case 'cluster': return p.cs.dvUsed;
    }
  }

  private missionDvForPhase(p: GameplayPhase): number {
    return p.missionDvStart + this.phaseDvUsed(p);
  }

  private phaseTitle(p: GameplayPhase): string {
    if (p.kind === 'landing') {
      return p.launchGuidance ? `Launch from ${p.level.name}` : (p.level.subtitle || p.level.name);
    }
    return p.level.subtitle || p.level.name;
  }

  private currentMissionCompletionText(): string {
    const mission = this.currentMissionId ? MISSIONS.find(m => m.id === this.currentMissionId) : null;
    return mission?.completionText ?? '';
  }

  private currentMissionDestinationName(): string | undefined {
    const mission = this.currentMissionId ? MISSIONS.find(m => m.id === this.currentMissionId) : null;
    return mission?.destinationName;
  }

  private currentMissionDestinationLocation(): string | undefined {
    const mission = this.currentMissionId ? MISSIONS.find(m => m.id === this.currentMissionId) : null;
    return mission?.destinationLocation;
  }

  private isOrbitalDeorbitObjective(level: OrbitalLevel): boolean {
    return !level.station && !level.targetBodyId && level.showLandingSite !== false;
  }

  private reloadPhase(p: GameplayPhase): void {
    this.phaseCompletion = null;
    this.missionDvUsed = p.missionDvStart;
    if (p.kind === 'landing') this.loadLanding(p.level, p.initOverride, p.launchGuidance, p.worldTimeStart);
    else if (p.kind === 'approach') this.loadApproach(p.level, p.initOverride, p.worldTimeStart);
    else if (p.kind === 'orbital') this.loadOrbital(p.level, p.initOverride, p.worldTimeStart);
    else if (p.kind === 'docking') this.loadDocking(p.level, p.initOverride, p.worldTimeStart);
    else this.loadCluster(p.level, p.worldTimeStart);
  }

  private completePhase(
    p: GameplayPhase,
    onContinue: () => void,
    completionText: string = '',
    extra: Partial<Pick<PhaseCompletion, 'ratingText' | 'ratingColor' | 'detailText' | 'tone' | 'title'>> = {},
  ): void {
    const phaseDvUsed = this.phaseDvUsed(p);
    const missionDvUsed = this.missionDvForPhase(p);
    this.missionDvUsed = missionDvUsed;
    this.guidanceText = '';
    this.phaseCompletion = {
      title: extra.title ?? this.phaseTitle(p),
      tone: extra.tone ?? 'success',
      phaseDvUsed,
      missionDvUsed,
      completionText,
      ...extra,
      onContinue: () => {
        this.phaseCompletion = null;
        onContinue();
      },
      onRetry: () => this.reloadPhase(p),
    };
    this.accumulator = 0;
  }

  private makeTransition(role: TransitionRole, run: () => void, title?: string, detailText?: string): PhaseTransition {
    return { role, run, title, detailText };
  }

  private completeTransition(
    p: GameplayPhase,
    transition: PhaseTransition,
    completionText: string = '',
    extra: Partial<Pick<PhaseCompletion, 'ratingText' | 'ratingColor' | 'detailText' | 'tone' | 'title'>> = {},
  ): void {
    const transitionExtra: Partial<Pick<PhaseCompletion, 'ratingText' | 'ratingColor' | 'detailText' | 'tone' | 'title'>> = {
      tone: transition.role === 'contingency' ? 'transition' : 'success',
    };
    if (transition.role === 'contingency') transitionExtra.title = transition.title ?? this.phaseTitle(p);
    if (transition.detailText !== undefined) transitionExtra.detailText = transition.detailText;
    this.completePhase(p, transition.run, completionText, { ...transitionExtra, ...extra });
  }

  // --- Landing phase ---

  private handleLanding(input: InputState, frameTime: number): void {
    const p = this.phase as Extract<Phase, { kind: 'landing' }>;

    if (input.reset) { this.reloadPhase(p); return; }
    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }
    if (input.toggleGear && p.state === 'flying') {
      p.ship.gearDeployed = !p.ship.gearDeployed;
      p.ship.autoRotateEnabled = true;
    }
    if (input.toggleSAS && p.state === 'flying') {
      p.ship.sas = !p.ship.sas;
    }

    input.toggleGear = false;
    input.toggleSAS = false;
    input.reset = false;
    input.levelSelect = false;
    input.levelPick = 0;

    this.accumulator += frameTime;
    while (this.accumulator >= PHYSICS_DT) {
      if (p.state === 'flying') {
        if (this.shouldHoldLaunchOnPad(p, input)) {
          this.clampLaunchShipToPad(p);
        } else {
          updateShip(p.ship, input, PHYSICS_DT, this.time);
          this.checkLandingCollision(p);
        }
        if (!p.launchGuidance && (p.state as GameState) === 'landed') {
          const ratingColors = { PERFECT: '#00ffff', GOOD: '#00ff88', HARD: '#ffaa00' } as const;
          const score = p.score ?? calculateLandingScore(p.ship, p.terrain);
          this.completePhase(
            p,
            () => {
              this.currentMissionId = null;
              this.phase = { kind: 'levelSelect' };
            },
            this.currentMissionCompletionText(),
            {
              ratingText: score.rating,
              ratingColor: ratingColors[score.rating],
              detailText: `V/S: ${score.vSpeed.toFixed(1)}  H/S: ${score.hSpeed.toFixed(1)}  Angle: ${(score.angle * 180 / Math.PI).toFixed(1)}°  Offset: ${score.distFromCenter.toFixed(1)}m`,
            },
          );
          return;
        }
        if (p.launchGuidance && p.state === 'flying') {
          const alt = p.ship.y - landingReferenceHeight(p.level, p.terrain, p.ship.x);
          if (alt >= p.launchGuidance.targetAltitude && p.ship.vy >= 0) {
            const transition = this.transitionLandingToApproach(p);
            if (transition) this.completeTransition(p, transition);
            else p.state = 'crashed';
            return;
          }
        }
        const refY = landingReferenceHeight(p.level, p.terrain, p.level.padCenterX);
        if (p.ship.y < refY - 500 || p.ship.y > refY + 2000 || p.ship.x < -200 || p.ship.x > 2200) {
          p.state = 'crashed';
        }
      }
      this.accumulator -= PHYSICS_DT;
      this.time += PHYSICS_DT;
      this.worldTime += PHYSICS_DT;
    }

    const th = landingReferenceHeight(p.level, p.terrain, p.ship.x);
    updateCamera(p.camera, p.ship, th, frameTime);
  }

  private checkLandingCollision(p: Extract<Phase, { kind: 'landing' }>): void {
    const pts = [...COLLISION_POINTS, ...(p.ship.gearDeployed ? GEAR_COLLISION_POINTS : [])];
    for (const [lx, ly] of pts) {
      const [wx, wy] = localToWorld(lx, ly, p.ship.x, p.ship.y, p.ship.angle, p.ship.facingSign);
      const collision = checkTerrainCollision(p.level, p.terrain, wx, wy);
      if (collision.hit) {
        if (!collision.onPad) { p.state = 'crashed'; return; }
        const vs = Math.abs(p.ship.vy), hs = Math.abs(p.ship.vx), ang = Math.abs(p.ship.angle);
        if (vs <= config.landingMaxVSpeed && hs <= config.landingMaxHSpeed &&
            ang <= config.landingMaxAngle && p.ship.gearDeployed) {
          if (p.launchGuidance) {
            const groundY = landingReferenceHeight(p.level, p.terrain, p.ship.x);
            p.ship.vx = 0; p.ship.vy = 0; p.ship.angularVel = 0; p.ship.angle = 0;
            p.ship.y = groundY + LANDING_GEAR_REST_HEIGHT;
            p.ship.sas = false;
          } else {
            p.state = 'landed';
            p.score = calculateLandingScore(p.ship, p.terrain);
            p.ship.vx = 0; p.ship.vy = 0; p.ship.angularVel = 0;
            p.ship.sas = false;
          }
        } else {
          p.state = 'crashed';
        }
        return;
      }
    }
  }

  private shouldHoldLaunchOnPad(
    p: Extract<Phase, { kind: 'landing' }>,
    input: InputState,
  ): boolean {
    if (!p.launchGuidance) return false;
    const onPad = isOnPad(p.terrain, p.ship.x);
    if (!onPad) return false;
    const groundY = landingReferenceHeight(p.level, p.terrain, p.ship.x);
    const grounded = Math.abs(p.ship.y - (groundY + LANDING_GEAR_REST_HEIGHT)) < 0.2;
    const settled = Math.abs(p.ship.vx) < 0.2 && Math.abs(p.ship.vy) < 0.2 && Math.abs(p.ship.angularVel) < 0.05 && Math.abs(p.ship.angle) < 0.05;
    const holding = !input.throttleUp && p.ship.throttle < 0.05;
    return grounded && settled && holding;
  }

  private clampLaunchShipToPad(p: Extract<Phase, { kind: 'landing' }>): void {
    const groundY = landingReferenceHeight(p.level, p.terrain, p.ship.x);
    p.ship.x = p.level.padCenterX;
    p.ship.y = groundY + LANDING_GEAR_REST_HEIGHT;
    p.ship.vx = 0;
    p.ship.vy = 0;
    p.ship.angle = 0;
    p.ship.angularVel = 0;
    p.ship.throttle = 0;
    p.ship.sas = false;
  }

  // --- Docking phase ---

  private handleDocking(input: InputState, frameTime: number): void {
    const p = this.phase as Extract<Phase, { kind: 'docking' }>;

    if (input.reset) { this.reloadPhase(p); return; }
    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }

    input.reset = false;
    input.levelSelect = false;

    this.accumulator += frameTime;
    while (this.accumulator >= PHYSICS_DT) {
      if (p.state === 'docking') {
        updateDocking(p.ds, input, p.level, PHYSICS_DT);
        input.toggleSAS = false;
        if (!p.ds.alive) p.state = 'crashed';
        if (p.ds.delivered) {
          p.state = 'delivered';
          const isFinal = !p.level.orbitalLevelId;
          const transition = p.level.orbitalLevelId
            ? this.transitionDockingToOrbital(p)
            : this.makeTransition('success', () => {
                this.currentMissionId = null;
                this.phase = { kind: 'levelSelect' };
              });
          if (transition) this.completeTransition(p, transition, isFinal ? this.currentMissionCompletionText() : '');
          else p.state = 'crashed';
          return;
        }
        if (p.ds.exitComplete) {
          const transition = this.transitionDockingToOrbital(p);
          if (transition) this.completeTransition(p, transition);
          else p.state = 'crashed';
          return;
        }
      }
      this.accumulator -= PHYSICS_DT;
      this.time += PHYSICS_DT;
      this.worldTime += PHYSICS_DT;
    }

    updateDockingCamera(p.cam, p.ds, p.level, frameTime, this.canvas.width, this.canvas.height);
  }

  private transitionDockingToOrbital(p: Extract<Phase, { kind: 'docking' }>): PhaseTransition | null {
    if (!p.level.orbitalLevelId) return null;
    const orbLevel = orbitalLevelById(p.level.orbitalLevelId);
    if (!orbLevel) return null;
    return this.makeTransition('success', () => this.loadOrbital(orbLevel, undefined, this.worldTime));
  }

  // --- Cluster phase ---

  private handleCluster(input: InputState, frameTime: number): void {
    const p = this.phase as Extract<Phase, { kind: 'cluster' }>;

    if (input.reset) { this.reloadPhase(p); return; }
    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }

    input.reset = false;
    input.levelSelect = false;

    if (input.warpUp) p.cs.timeWarpLevel = Math.min(p.cs.timeWarpLevel + 1, p.level.timeWarpLevels.length - 1);
    if (input.warpDown) p.cs.timeWarpLevel = Math.max(p.cs.timeWarpLevel - 1, 0);
    p.cs.timeWarp = p.level.timeWarpLevels[p.cs.timeWarpLevel] ?? 1;
    if ((input.moveUp || input.moveDown || input.moveLeft || input.moveRight || input.rotateLeft || input.rotateRight) && p.cs.timeWarpLevel > 0) {
      p.cs.timeWarpLevel = 0;
      p.cs.timeWarp = p.level.timeWarpLevels[0] ?? 1;
    }
    input.warpUp = false;
    input.warpDown = false;

    const effectiveFrameTime = frameTime * p.level.baseTimeScale * p.cs.timeWarp;
    this.accumulator += effectiveFrameTime;
    while (this.accumulator >= PHYSICS_DT) {
      if (p.state === 'flying') {
        updateCluster(p.cs, input, p.level, PHYSICS_DT);
        input.toggleSAS = false;
        if (!p.cs.alive) p.state = 'crashed';
        if (p.cs.arrived) {
          p.state = 'arrived';
          this.completePhase(
            p,
            () => {
              this.currentMissionId = null;
              this.phase = { kind: 'levelSelect' };
            },
            this.currentMissionCompletionText(),
            { title: 'Near Belt Local Traffic', detailText: 'Berth approach complete. Docking handoff comes next.' },
          );
          return;
        }
      }
      this.accumulator -= PHYSICS_DT;
      this.time += PHYSICS_DT;
      this.worldTime += PHYSICS_DT;
    }

    updateClusterCamera(p.cam, p.cs, p.level, effectiveFrameTime, this.canvas.width, this.canvas.height);
  }

  // --- Orbital phase ---

  private handleOrbital(input: InputState, frameTime: number): void {
    const p = this.phase as Extract<Phase, { kind: 'orbital' }>;

    if (input.reset) { this.reloadPhase(p); return; }
    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }

    input.reset = false;
    input.levelSelect = false;

    this.accumulator += frameTime;
    while (this.accumulator >= PHYSICS_DT) {
      if (p.state === 'orbiting') {
        const prevOrbitalState = {
          x: p.os.x,
          y: p.os.y,
          vx: p.os.vx,
          vy: p.os.vy,
          time: p.os.time,
        };
        updateOrbital(p.os, input, p.level, PHYSICS_DT);
        // Clear edge triggers after first step
        input.warpUp = false;
        input.warpDown = false;

        if (!p.os.alive) p.state = 'crashed';
        if (p.os.docked) {
          if (p.level.dockingLevelId) {
            const transition = this.transitionOrbitalToDocking(p);
            if (transition) this.completeTransition(p, transition);
            else p.state = 'crashed';
            return;
          }
          p.state = 'docked';
        }
        const orbitalContinue = this.handleOrbitalTransitions(p, prevOrbitalState);
        if (orbitalContinue) {
          this.completeTransition(p, orbitalContinue);
          return;
        }
        if (p.os.enteredAtmo) {
          const role: TransitionRole = this.isOrbitalDeorbitObjective(p.level) ? 'success' : 'contingency';
          const transition = this.transitionOrbitalToApproach(p, role);
          if (transition) this.completeTransition(p, transition);
          else p.state = 'crashed';
          return;
        }
      }
      this.accumulator -= PHYSICS_DT;
      this.time += PHYSICS_DT;
      this.worldTime += PHYSICS_DT;
    }

    updateOrbitalCamera(p.cam, p.os, p.level, frameTime, this.canvas.width, this.canvas.height);
  }

  private handleOrbitalTransitions(
    p: Extract<Phase, { kind: 'orbital' }>,
    prev?: { x: number; y: number; vx: number; vy: number; time: number },
  ): PhaseTransition | null {
    const rFromCenter = Math.sqrt(p.os.x * p.os.x + p.os.y * p.os.y);
    const escapeBoundary = p.level.escapeSOIRadius ?? p.level.conicRadius;
    if (!p.level.systemBodies && escapeBoundary && !p.level.escapeToOrbitalLevelId && rFromCenter >= escapeBoundary) {
      return this.makeTransition('contingency', () => this.phase = { kind: 'levelSelect' }, 'Left flight region', 'No configured transition exists beyond this conic.');
    }

    if (p.level.escapeSOIRadius && p.level.escapeToOrbitalLevelId) {
      const r = rFromCenter;
      if (r >= p.level.escapeSOIRadius) {
        const nextLevel = orbitalLevelById(p.level.escapeToOrbitalLevelId);
        if (!nextLevel) return null;
        const parentBodyId = bodyById(p.level.bodyId).orbit?.parentBodyId;
        const nextContainsEscapingBody = !!getTransferBody(nextLevel, p.level.bodyId);
        const nextIsParentFrame = !!parentBodyId && nextLevel.bodyId === parentBodyId;
        if (!nextContainsEscapingBody && !nextIsParentFrame) return null;
        const originState = transferBodyState(nextLevel, p.level.bodyId, p.os.time)
          ?? (nextIsParentFrame ? bodyStateRelativeToParent(p.level.bodyId, p.os.time) : null);
        if (!originState) return null;
        const escape = currentEscapeVector(p.os, p.level);
        const localSpeed = Math.sqrt(p.os.vx * p.os.vx + p.os.vy * p.os.vy);
        if (!escape && localSpeed < 0.01) return null;
        const escapeAngle = escape?.angle ?? Math.atan2(p.os.vy, p.os.vx);
        const vInf = escape?.vInf ?? 0;
        const initOverride: OrbitalInitOverride = {
          x: originState.x,
          y: originState.y,
          vx: originState.vx + Math.cos(escapeAngle) * vInf,
          vy: originState.vy + Math.sin(escapeAngle) * vInf,
          time: p.os.time,
        };
        return this.makeTransition('success', () => this.loadOrbital(nextLevel, initOverride, p.os.time));
      }
    }

    if (p.level.targetBodyId) {
      const body = getTransferBody(p.level, p.level.targetBodyId);
      const bodyState = body ? transferBodyState(p.level, body.id, p.os.time) : null;
      if (!body || !bodyState) return null;

      let captureRX = p.os.x - bodyState.x;
      let captureRY = p.os.y - bodyState.y;
      let captureRVX = p.os.vx - bodyState.vx;
      let captureRVY = p.os.vy - bodyState.vy;
      let captureTime = p.os.time;
      let captureDist = Math.sqrt(captureRX * captureRX + captureRY * captureRY);
      let arrivalReady = captureDist <= body.patchRadius;

      if (!arrivalReady && p.os.pendingBodyCapture?.bodyId === body.id) {
        captureRX = p.os.pendingBodyCapture.rx;
        captureRY = p.os.pendingBodyCapture.ry;
        captureRVX = p.os.pendingBodyCapture.rvx;
        captureRVY = p.os.pendingBodyCapture.rvy;
        captureTime = p.os.pendingBodyCapture.time;
        captureDist = Math.sqrt(captureRX * captureRX + captureRY * captureRY);
        arrivalReady = captureDist <= body.patchRadius;
      }

      if (!arrivalReady && prev) {
        const prevBodyState = transferBodyState(p.level, body.id, prev.time);
        if (prevBodyState) {
          const prevRX = prev.x - prevBodyState.x;
          const prevRY = prev.y - prevBodyState.y;
          const prevDist = Math.sqrt(prevRX * prevRX + prevRY * prevRY);
          if (prevDist > body.patchRadius && captureDist <= body.patchRadius) {
            const denom = captureDist - prevDist;
            const frac = Math.max(0, Math.min(1, (body.patchRadius - prevDist) / (Math.abs(denom) > 1e-6 ? denom : -1e-6)));
            captureTime = prev.time + (p.os.time - prev.time) * frac;
            const shipX = prev.x + (p.os.x - prev.x) * frac;
            const shipY = prev.y + (p.os.y - prev.y) * frac;
            const shipVX = prev.vx + (p.os.vx - prev.vx) * frac;
            const shipVY = prev.vy + (p.os.vy - prev.vy) * frac;
            const crossBodyState = transferBodyState(p.level, body.id, captureTime);
            if (crossBodyState) {
              captureRX = shipX - crossBodyState.x;
              captureRY = shipY - crossBodyState.y;
              captureRVX = shipVX - crossBodyState.vx;
              captureRVY = shipVY - crossBodyState.vy;
              captureDist = Math.sqrt(captureRX * captureRX + captureRY * captureRY);
              arrivalReady = true;
            }
          }
        }
      }

      if (!arrivalReady) return null;

      const arrivalLevelId = body.arrivalOrbitalLevelId;
      const arrivalLevel = arrivalLevelId ? orbitalLevelById(arrivalLevelId) : null;
      if (!arrivalLevel || arrivalLevel.bodyId !== body.id) return null;

      const arrival = fuzzyArrivalStateFromEntry(body, captureRX, captureRY, captureRVX, captureRVY);
      const initOverride: OrbitalInitOverride = {
        x: arrival.x,
        y: arrival.y,
        vx: arrival.vx,
        vy: arrival.vy,
        time: captureTime,
      };
      return this.makeTransition('success', () => this.loadOrbital(arrivalLevel, initOverride, captureTime));
    }

    return null;
  }

  private transitionLandingToApproach(p: Extract<Phase, { kind: 'landing' }>): PhaseTransition | null {
    const nextId = p.launchGuidance?.nextApproachLevelId;
    const approachLevel = nextId ? approachLevelById(nextId) : undefined;
    if (!approachLevel || !approachLevel.departure || approachLevel.body.id !== p.level.body.id) return null;

    const terrainH = landingReferenceHeight(p.level, p.terrain, p.ship.x);
    const speed = Math.hypot(p.ship.vx, p.ship.vy);
    const progradeAngle = speed > 0.1 ? Math.atan2(p.ship.vx, p.ship.vy) : p.ship.angle;
    const initOverride: ApproachInitOverride = {
      x: p.ship.x - p.level.padCenterX,
      y: Math.max(0, p.ship.y - terrainH),
      vx: p.ship.vx,
      vy: p.ship.vy,
      angle: progradeAngle,
    };
    return this.makeTransition('success', () => this.loadApproach(approachLevel, initOverride));
  }

  private transitionApproachToLanding(p: Extract<Phase, { kind: 'approach' }>): PhaseTransition | null {
    const landingLevel = landingLevelById(p.level.landingLevelId);
    if (!landingLevel || landingLevel.body.id !== p.level.body.id) return null;

    if (p.level.gateRadius > 0) {
      const gateLeft = p.level.gateX - p.level.gateRadius;
      const gateWidth = Math.max(1, p.level.gateRadius * 2);
      const nx = Math.max(0, Math.min(1, (p.as.x - gateLeft) / gateWidth));
      const ny = Math.max(0, Math.min(1, p.as.y / Math.max(1, p.level.gateY)));

      const landingHalfSpan = 500;
      const landingAltMin = 100;
      const landingAltMax = 300;
      const noseX = Math.sin(p.as.angle);
      const facingSign: 1 | -1 = Math.abs(noseX) > 0.05 ? (noseX > 0 ? 1 : -1) : (p.as.vx < 0 ? -1 : 1);
      const initOverride = {
        x: landingLevel.padCenterX + (nx * 2 - 1) * landingHalfSpan,
        y: landingLevel.padY + (landingAltMin + ny * (landingAltMax - landingAltMin)),
        vx: Math.max(-20, Math.min(20, p.as.vx)),
        vy: Math.max(-5, Math.min(20, p.as.vy)),
        facingSign,
      };
      return this.makeTransition('success', () => this.loadLanding(landingLevel, initOverride));
    }

    const speed = Math.sqrt(p.as.vx * p.as.vx + p.as.vy * p.as.vy);
    const maxEntrySpeed = 50;
    let vx = p.as.vx;
    let vy = p.as.vy;
    if (speed > maxEntrySpeed) {
      const scale = maxEntrySpeed / speed;
      vx *= scale;
      vy *= scale;
    }
    const targetAlt = landingLevel.startY;
    const startY = Math.max(landingLevel.padY + targetAlt * 0.5, Math.min(p.as.y, landingLevel.padY + targetAlt));
    vy = Math.max(vy, -10);

    const noseX = Math.sin(p.as.angle);
    const facingSign: 1 | -1 = Math.abs(noseX) > 0.05 ? (noseX > 0 ? 1 : -1) : (vx < 0 ? -1 : 1);
    const initOverride = {
      x: landingLevel.padCenterX,
      y: startY,
      vx: Math.min(Math.abs(vx), 10) * (vx > 0 ? 1 : -1),
      vy: vy,
      facingSign,
    };
    return this.makeTransition('success', () => this.loadLanding(landingLevel, initOverride));
  }

  private transitionOrbitalToApproach(p: Extract<Phase, { kind: 'orbital' }>, role: TransitionRole = 'success'): PhaseTransition | null {
    const explicitId = p.level.reentryApproachLevelId;
    const approachLevel = explicitId
      ? approachLevelById(explicitId)
      : APPROACH_LEVELS[p.level.approachLevelIdx];
    if (!approachLevel || approachLevel.departure || approachLevel.body.id !== p.level.bodyId) return null;
    const params = orbitalToApproachParams(p.os, p.level);
    return this.makeTransition(
      role,
      () => this.loadApproach(approachLevel, params, p.os.time),
      role === 'contingency' ? (p.level.atmoHeight > 0 ? 'Entering atmosphere' : 'Entering approach') : undefined,
      role === 'contingency' ? 'This is not the primary objective for the current orbital phase.' : undefined,
    );
  }

  private approachToOrbitalInit(level: ApproachLevel, as: ApproachState, orbitalLevel: OrbitalLevel): OrbitalInitOverride {
    if (level.body.atmosphere === null) {
      return {
        x: as.worldX,
        y: as.worldY,
        vx: as.worldVX,
        vy: as.worldVY,
      };
    }

    const ref = level.frame;
    const localDir = ref.localDir;
    const theta = ref.landingSiteAngle + as.x / (ref.planetRadius * localDir);
    const r = ref.planetRadius + Math.max(0, as.y);
    const radX = Math.cos(theta), radY = Math.sin(theta);
    const tanX = -radY * localDir, tanY = radX * localDir;
    return {
      x: radX * r,
      y: radY * r,
      vx: tanX * as.vx + radX * as.vy,
      vy: tanY * as.vx + radY * as.vy,
    };
  }

  private transitionApproachToOrbital(p: Extract<Phase, { kind: 'approach' }>, role: TransitionRole = 'success'): PhaseTransition | null {
    const orbitalLevelId = p.level.departure?.orbitalLevelId ?? p.level.returnToOrbital?.orbitalLevelId;
    if (!orbitalLevelId) return null;
    const orbitalLevel = orbitalLevelById(orbitalLevelId);
    if (!orbitalLevel || orbitalLevel.bodyId !== p.level.body.id) return null;
    const init = this.approachToOrbitalInit(p.level, p.as, orbitalLevel);
    const worldTime = p.worldTimeStart + this.time;
    return this.makeTransition(
      role,
      () => this.loadOrbital(orbitalLevel, init, worldTime),
      role === 'contingency' ? 'Returning to orbit' : undefined,
      role === 'contingency' ? 'You climbed out of the descent corridor.' : undefined,
    );
  }

  private transitionOrbitalToDocking(p: Extract<Phase, { kind: 'orbital' }>): PhaseTransition | null {
    const dockingLevelId = p.level.dockingLevelId;
    const dockingLevel = dockingLevelId ? DOCKING_LEVELS.find(l => l.id === dockingLevelId) : null;
    const station = p.level.station;
    if (!dockingLevel || !station) return null;

    const sense = station.orbitSense;
    const stOmega = sense * Math.sqrt(p.level.planetGM / (station.orbitRadius ** 3));
    const stAngle = station.epochAngle + stOmega * (p.os.time - station.epochTime);
    const stSpeed = Math.sqrt(p.level.planetGM / station.orbitRadius);
    const stX = station.orbitRadius * Math.cos(stAngle);
    const stY = station.orbitRadius * Math.sin(stAngle);
    const stVX = -sense * stSpeed * Math.sin(stAngle);
    const stVY = sense * stSpeed * Math.cos(stAngle);

    let relX = p.os.x - stX;
    let relY = p.os.y - stY;
    let relDist = Math.sqrt(relX * relX + relY * relY);
    const relVX = p.os.vx - stVX;
    const relVY = p.os.vy - stVY;

    if (relDist < 1) {
      relX = relVX;
      relY = relVY;
      relDist = Math.sqrt(relX * relX + relY * relY);
    }
    if (relDist < 1) {
      relX = -1;
      relY = 0;
      relDist = 1;
    }

    const ux = relX / relDist;
    const uy = relY / relDist;
    const baseDist = dockingLevel.beamRange * 10;
    const startDist = baseDist * (1 + Math.min(1, relDist / station.captureRadius));
    const initOverride: DockingInitOverride = {
      x: ux * startDist,
      y: uy * startDist,
      vx: relVX,
      vy: relVY,
      angle: Math.atan2(-uy, -ux),
    };
    return this.makeTransition('success', () => this.loadDocking(dockingLevel, initOverride, p.os.time));
  }

  // --- Approach phase ---

  private handleApproach(input: InputState, frameTime: number): void {
    const p = this.phase as Extract<Phase, { kind: 'approach' }>;

    if (input.reset) { this.reloadPhase(p); return; }
    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }

    input.reset = false;
    input.levelSelect = false;

    if (input.warpUp) {
      p.as.timeWarpLevel = Math.min(p.as.timeWarpLevel + 1, 2);
      p.as.timeWarp = [1, 2, 5][p.as.timeWarpLevel];
    }
    if (input.warpDown) {
      p.as.timeWarpLevel = Math.max(p.as.timeWarpLevel - 1, 0);
      p.as.timeWarp = [1, 2, 5][p.as.timeWarpLevel];
    }
    if ((input.throttleUp || input.throttleDown) && p.as.timeWarpLevel > 0) {
      p.as.timeWarpLevel = 0;
      p.as.timeWarp = 1;
    }
    input.warpUp = false;
    input.warpDown = false;

    const effectiveFrameTime = frameTime * p.as.timeWarp;
    this.accumulator += effectiveFrameTime;
    let edgeConsumed = false;
    while (this.accumulator >= PHYSICS_DT) {
      if (p.state === 'approaching') {
        updateApproach(p.as, input, p.level, PHYSICS_DT, this.time);
        // Clear edge triggers after first physics step
        if (!edgeConsumed) { edgeConsumed = true; }
        else { input.toggleWings = false; }

        if (!p.as.alive) p.state = 'approachFailed';
        if (p.as.gateReached) {
          const transition = p.level.departure
            ? this.transitionApproachToOrbital(p, 'success')
            : this.transitionApproachToLanding(p);
          if (transition) this.completeTransition(p, transition);
          else p.state = 'approachFailed';
          return;
        }
        if (p.level.returnToOrbital && p.as.vy > 0 && p.as.y > p.level.returnToOrbital.exitAltitude + 50) {
          const transition = this.transitionApproachToOrbital(p, 'contingency');
          if (transition) this.completeTransition(p, transition);
          else p.state = 'approachFailed';
          return;
        }
      }
      this.accumulator -= PHYSICS_DT;
      this.time += PHYSICS_DT;
      this.worldTime += PHYSICS_DT;
    }

    updateApproachCamera(p.cam, p.as, p.level, effectiveFrameTime, this.canvas.width, this.canvas.height);
  }

  // --- Estella navigation prototype ---

  private handleEstellaNavigation(input: InputState): void {
    const p = this.phase as Extract<Phase, { kind: 'estellaNav' }>;

    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }
    if (input.reset) { resetEstellaNavSelection(p.nav); return; }
    if (input.menuUp) moveEstellaCursor(p.nav, -1);
    if (input.menuDown) moveEstellaCursor(p.nav, 1);
    if (input.menuLeft) estellaNavBack(p.nav);
    if (input.menuRight) estellaNavForward(p.nav);
    if (input.menuConfirm) {
      estellaNavActivate(p.nav);
      if (p.nav.selecting === 'ready' && p.nav.sourceId && p.nav.destinationId) {
        this.phase = { kind: 'estellaMission', mission: generateEstellaMission(p.nav.sourceId, p.nav.destinationId) };
      }
    }
  }

  private handleEstellaGeneratedMission(input: InputState): void {
    const p = this.phase as Extract<Phase, { kind: 'estellaMission' }>;
    if (input.levelSelect) { this.phase = { kind: 'levelSelect' }; return; }
    if (p.mission.transferOptions.length) {
      if (input.menuLeft) p.mission.selectedTransferOption = (p.mission.selectedTransferOption - 1 + p.mission.transferOptions.length) % p.mission.transferOptions.length;
      if (input.menuRight) p.mission.selectedTransferOption = (p.mission.selectedTransferOption + 1) % p.mission.transferOptions.length;
    }
    if (input.menuConfirm) {
      const startWorldTime = p.mission.transferOptions[p.mission.selectedTransferOption]?.waitTime ?? 0;
      this.launchPlayableEstellaMission(p.mission.sourceId, p.mission.destinationId, startWorldTime);
    }
  }

  private launchPlayableEstellaMission(sourceId: string, destinationId: string, startWorldTime: number = 0): void {
    const generated = createPlayableEstellaMission(sourceId, destinationId);
    this.currentMissionId = 8;
    this.phaseCompletion = null;
    this.missionDvUsed = 0;
    this.worldTime = startWorldTime;
    if (generated.start.kind === 'landing') {
      this.loadLanding(
        generated.start.level,
        { x: generated.start.level.padCenterX, y: generated.start.level.padY + LANDING_GEAR_REST_HEIGHT, vx: 0, vy: 0 },
        { targetAltitude: generated.start.level.startY, orbitDir: generatedEstellaDepartureOrbitDir(destinationId, sourceId), nextApproachLevelId: generated.start.nextApproachLevelId },
      );
    } else {
      this.loadDocking(generated.start.level);
    }
  }

  // --- Render ---

  private renderFrame(): void {
    const p = this.phase;
    const mission = this.currentMissionId ? MISSIONS.find(m => m.id === this.currentMissionId) : null;
    const completionText = mission?.completionText ?? '';
    const destinationName = mission?.destinationName;
    const destinationLocation = mission?.destinationLocation;
    const suppressStateOverlays = !!this.phaseCompletion;

    if (p.kind === 'levelSelect') {
      drawLevelSelect(this.ctx, this.canvas, this.menuSelection);
    } else if (p.kind === 'landing') {
      render(this.ctx, this.canvas, p.camera, p.ship, p.terrain, p.level, this.time);
      drawHUD(this.ctx, this.canvas, p.ship, p.terrain, p.state, p.score, p.level, completionText, destinationName, destinationLocation, p.launchGuidance, this.phaseDvUsed(p), this.missionDvForPhase(p), suppressStateOverlays);
    } else if (p.kind === 'approach') {
      renderApproach(this.ctx, this.canvas, p.cam, p.as, p.level, this.time);
      drawApproachHUD(this.ctx, this.canvas, p.as, p.level, p.state, this.time, destinationName, destinationLocation, this.phaseDvUsed(p), this.missionDvForPhase(p), suppressStateOverlays);
    } else if (p.kind === 'orbital') {
      renderOrbital(this.ctx, this.canvas, p.cam, p.os, p.level, this.time);
      drawOrbitalHUD(this.ctx, this.canvas, p.os, p.level, p.state, destinationName, destinationLocation, this.phaseDvUsed(p), this.missionDvForPhase(p), suppressStateOverlays);
    } else if (p.kind === 'docking') {
      renderDocking(this.ctx, this.canvas, p.cam, p.ds, p.level, this.time);
      drawDockingHUD(this.ctx, this.canvas, p.ds, p.level, p.state, completionText, destinationName, destinationLocation, this.phaseDvUsed(p), this.missionDvForPhase(p), suppressStateOverlays);
    } else if (p.kind === 'cluster') {
      renderCluster(this.ctx, this.canvas, p.cam, p.cs, p.level, this.time);
      drawClusterHUD(this.ctx, this.canvas, p.cs, p.level, p.state, this.phaseDvUsed(p), this.missionDvForPhase(p), suppressStateOverlays);
    } else if (p.kind === 'estellaNav') {
      drawEstellaNavigation(this.ctx, this.canvas, p.nav);
    } else if (p.kind === 'estellaMission') {
      drawEstellaGeneratedMission(this.ctx, this.canvas, p.mission);
    }
    this.drawGuidanceBanner();
    if (this.phaseCompletion) {
      drawPhaseCompleteOverlay(
        this.ctx,
        this.canvas,
        this.phaseCompletion.title,
        this.phaseCompletion.phaseDvUsed,
        this.phaseCompletion.missionDvUsed,
        this.phaseCompletion.completionText,
        this.phaseCompletion.ratingText,
        this.phaseCompletion.ratingColor,
        this.phaseCompletion.detailText,
        this.phaseCompletion.tone,
      );
    }
  }
}
