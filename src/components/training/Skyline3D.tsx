"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SportBucket } from "@/lib/training/types";
import { fmtDay, fmtHM, fmtHours } from "./format";
import { SportPill, pillLabel } from "./SportPill";
import type { SkylineDay } from "./skyline";
import { WEEKDAY_LABELS, pickCallouts, totalMinutes } from "./skyline";

/** Stack order, bottom to top, and the chart palette (sportFill, resolved for WebGL). */
const STACK: SportBucket[] = ["swim", "bike", "run", "strength"];
const COLOR: Record<SportBucket, string> = {
  swim: "#b4ada5",
  bike: "#d8121f",
  run: "#1f1f1f",
  strength: "#c08a3e",
};
/** Scene units per minute: a 150-minute day stands 3 units tall, unless the biggest day would pass TALLEST. */
const UNITS_PER_MIN = 3 / 150;
const TALLEST = 4.5;
const TILE = 0.82;
/**
 * Playback pacing. Each day stacks STEP apart and rises over RISE; both shrink
 * as the block grows so a full build takes about BUILD_MS whatever its length
 * (a few days play slowly, 154 days still finish in seconds). It holds on the
 * finished skyline for HOLD_MS, then rewinds newest day first in about
 * REWIND_MS and plays again. With looping off it stops on the finished skyline.
 */
const BUILD_MS = 12000;
const MAX_STEP_MS = 420;
const MIN_STEP_MS = 60;
const HOLD_MS = 3800;
const REWIND_MS = 2400;
/** Callout cards change at most this often, so a fast build never flickers them. */
const CALLOUT_MS = 1400;

/** Ease out with a small overshoot, so each day lands with a little bounce. */
function easeOutBack(p: number): number {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/** Where the callout cards sit over the scene. The third shows from sm up only. */
const SLOTS = [
  "left-2 top-2 sm:left-3 sm:top-3",
  "right-2 top-2 sm:right-3 sm:top-3",
  "hidden sm:block right-3 bottom-4",
];

interface Hover {
  day: SkylineDay;
  x: number;
  y: number;
}

type Variant = "page" | "hero";

/**
 * The training skyline: every day of the window as a tile on a weeks x
 * weekdays grid. Trained days rise as towers stacked by sport, height by
 * minutes; future days are faint tiles; race day is a red beacon. A few
 * trained days get callout cards (their photo, sport and session) with arrows
 * that track the towers as the scene turns.
 *
 * three.js loads only here, on the client, and the loop pauses while the
 * scene is off screen. "hero" (the letter) turns off scroll-zoom so the page
 * scrolls normally and lets vertical swipes scroll on touch screens; "page"
 * (/training/3d) allows zoom. Reduced motion: no auto-orbit, no rise-in.
 */
export function Skyline3D({ days, variant = "page" }: { days: SkylineDay[]; variant?: Variant }) {
  const mount = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const markerId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<Hover | null>(null);
  const [failed, setFailed] = useState(false);
  // Picked once the scene loads (see the effect): random choices must not run during the server render.
  const [callouts, setCallouts] = useState<number[]>([]);
  const calloutsRef = useRef<number[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  // Playback: the render loop reads the refs; the state only drives the buttons.
  const [playing, setPlaying] = useState(true);
  const [looping, setLooping] = useState(true);
  const [ended, setEnded] = useState(false);
  const playingRef = useRef(true);
  const loopingRef = useRef(true);
  const restartRef = useRef(false);
  const hudDayRef = useRef<HTMLSpanElement>(null);
  const hudHoursRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  // Where the playback ends (today, or the last past day) and the static totals shown when paused.
  const lastIndex = days.reduce((last, d, i) => (d.when !== "future" ? i : last), -1);
  const totalStacked = days.reduce((n, d, i) => (i <= lastIndex ? n + totalMinutes(d) : n), 0);
  const restLabel = lastIndex >= 0 ? `Day ${days[lastIndex].day} · ${fmtDay(days[lastIndex].date)}` : "Day 1 is Nov 2";

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const hero = variant === "hero";
      // Callouts: during playback they follow the days as they stack (below, in the loop). Without playback
      // (reduced motion, or nothing logged yet) a random few are shown; random picks run here in the browser,
      // never during the server render. Each slot holds a day index, or -1 when empty.
      const staticPicks = pickCallouts(days, SLOTS.length);
      const initial = SLOTS.map((_, k) => staticPicks[k] ?? -1);
      calloutsRef.current = initial;
      setCallouts(initial);

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      // In the hero, let vertical swipes scroll the page; horizontal drags still orbit.
      renderer.domElement.style.touchAction = hero ? "pan-y" : "none";

      const scene = new THREE.Scene();
      const weeks = Math.max(...days.map((d) => d.week)) + 1;
      const cx = (weeks - 1) / 2;
      const cz = 3;

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
      // Open from the front-left, looking along the weeks toward race day.
      camera.position.set(-9, 15, 25);

      // Light: soft sky fill plus a warm key from the upper left that casts shadows.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e4dc, 1.15));
      const key = new THREE.DirectionalLight(0xfff4ea, 2.1);
      key.position.set(-10, 18, 8);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -18;
      key.shadow.camera.right = 18;
      key.shadow.camera.top = 12;
      key.shadow.camera.bottom = -12;
      key.shadow.radius = 6;
      key.shadow.bias = -0.0004;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbfdcff, 0.6);
      rim.position.set(12, 6, -10);
      scene.add(rim);

      // Ground that only shows shadows, so the page's glow shows through.
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.ShadowMaterial({ opacity: 0.12 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const tileGeo = new RoundedBoxGeometry(TILE, 0.08, TILE, 3, 0.06);
      const segGeo = new RoundedBoxGeometry(TILE * 0.86, 1, TILE * 0.86, 3, 0.08);
      const mats: InstanceType<typeof THREE.Material>[] = [];
      const mat = (color: string, opts: Record<string, unknown> = {}) => {
        const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, ...opts });
        mats.push(m);
        return m;
      };
      const sportMat = Object.fromEntries(STACK.map((s) => [s, mat(COLOR[s])])) as Record<
        SportBucket,
        InstanceType<typeof THREE.MeshStandardMaterial>
      >;
      const pastTile = mat("#e7e3dd");
      const futureTile = mat("#f1eee9", { transparent: true, opacity: 0.85 });
      const todayTile = mat("#141414");

      const pickables: InstanceType<typeof THREE.Mesh>[] = [];
      const groups: { group: InstanceType<typeof THREE.Group>; index: number }[] = [];
      const dayMeshes = new Map<number, InstanceType<typeof THREE.Mesh>[]>();
      /** Per day: tile centre and full tower height, so callouts can find the top. */
      const anchors = new Map<number, { x: number; z: number; h: number; group: InstanceType<typeof THREE.Group> | null }>();

      const biggest = Math.max(1, ...days.map((d) => totalMinutes(d)));
      const unitsPerMin = Math.min(UNITS_PER_MIN, TALLEST / biggest);
      days.forEach((d, i) => {
        const x = d.week - cx;
        const z = d.weekday - cz;
        const tile = new THREE.Mesh(tileGeo, d.when === "today" ? todayTile : d.when === "future" ? futureTile : pastTile);
        tile.position.set(x, 0.04, z);
        tile.receiveShadow = true;
        tile.userData.index = i;
        scene.add(tile);
        pickables.push(tile);
        const meshes: InstanceType<typeof THREE.Mesh>[] = [tile];

        const total = totalMinutes(d);
        let group: InstanceType<typeof THREE.Group> | null = null;
        let y = 0;
        if (total > 0) {
          group = new THREE.Group();
          group.position.set(x, 0.08, z);
          for (const s of STACK) {
            const h = d.minutes[s] * unitsPerMin;
            if (h <= 0) continue;
            const seg = new THREE.Mesh(segGeo, sportMat[s]);
            seg.scale.y = h;
            seg.position.y = y + h / 2;
            seg.castShadow = true;
            seg.receiveShadow = true;
            seg.userData.index = i;
            group.add(seg);
            pickables.push(seg);
            meshes.push(seg);
            y += h;
          }
          if (!reduced) {
            group.scale.y = 0.0001;
            group.visible = false;
          }
          scene.add(group);
          groups.push({ group, index: i });
        }
        anchors.set(i, { x, z, h: y, group });
        dayMeshes.set(i, meshes);
      });

      // Race day: a translucent red beacon with a glowing cap.
      const race = days[days.length - 1];
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 4.2, 40, 1, true),
        mat("#d8121f", { transparent: true, opacity: 0.18, emissive: "#d8121f", emissiveIntensity: 0.35, side: THREE.DoubleSide }),
      );
      beacon.position.set(race.week - cx, 2.15, race.weekday - cz);
      scene.add(beacon);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), mat("#d8121f", { emissive: "#ff3c50", emissiveIntensity: 0.9 }));
      cap.position.set(race.week - cx, 4.4, race.weekday - cz);
      scene.add(cap);

      // Text labels as canvas sprites: months along the front, weekdays down the side, race day above the beacon.
      const textures: InstanceType<typeof THREE.Texture>[] = [];
      const label = (text: string, color: string, scale: number) => {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d")!;
        const font = "600 44px 'Courier Prime', 'Courier New', monospace";
        ctx.font = font;
        const w = Math.ceil(ctx.measureText(text).width) + 24;
        c.width = w;
        c.height = 64;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.fillText(text, 12, 34);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        textures.push(tex);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        mats.push(sprite.material);
        sprite.scale.set((w / 64) * scale, scale, 1);
        return sprite;
      };
      let lastMonth = "";
      for (const d of days) {
        if (d.weekday !== 0) continue;
        const m = new Date(`${d.date}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
        if (m === lastMonth) continue;
        lastMonth = m;
        const s = label(m, "#4a4a4a", 0.5);
        s.position.set(d.week - cx + 0.5, 0.42, 3 - cz + 1.45);
        scene.add(s);
      }
      WEEKDAY_LABELS.forEach((name, row) => {
        const s = label(name, "#737373", 0.38);
        s.position.set(-cx - 1.35, 0.3, row - cz);
        scene.add(s);
      });
      const raceLabel = label("RACE DAY", "#d8121f", 0.5);
      raceLabel.position.set(race.week - cx, 5.15, race.weekday - cz);
      scene.add(raceLabel);

      // Today: a thin ink flagpole with a "TODAY" tag, floating above today's tile (skipped on race day).
      const todayIndex = days.findIndex((d) => d.when === "today");
      if (todayIndex >= 0 && todayIndex < days.length - 1) {
        const td = days[todayIndex];
        const tx = td.week - cx;
        const tz = td.weekday - cz;
        const poleTop = Math.max(2.4, totalMinutes(td) * unitsPerMin + 1.2);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, poleTop, 12), mat("#141414"));
        pole.position.set(tx, poleTop / 2, tz);
        scene.add(pole);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12), mat("#141414"));
        knob.position.set(tx, poleTop, tz);
        scene.add(knob);
        const tag = label("TODAY", "#141414", 0.46);
        tag.position.set(tx, poleTop + 0.45, tz);
        scene.add(tag);
      }

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.4, 0.4);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableZoom = !hero;
      controls.minDistance = 10;
      controls.maxDistance = 46;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = Math.PI / 2.15;
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = hero ? 0.4 : 0.55;
      controls.update();
      const baseDistance = camera.position.distanceTo(controls.target);

      let width = 1;
      let height = 1;
      const resize = () => {
        width = el.clientWidth;
        height = el.clientHeight;
        renderer.setSize(width, height, false);
        renderer.domElement.style.width = `${width}px`;
        renderer.domElement.style.height = `${height}px`;
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        // Back the camera off as the view gets narrower so the whole grid fits;
        // very wide hero views frame a little tighter than the full page.
        const fit = Math.min(2.2, Math.max(hero ? 0.86 : 1, 1.5 / camera.aspect));
        controls.maxDistance = 46 * fit;
        const dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).add(dir.multiplyScalar(baseDistance * fit));
        controls.update();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      // Hover and click: raycast against tiles and tower segments.
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let hovered = -1;
      const highlight = (index: number, on: boolean) => {
        for (const m of dayMeshes.get(index) ?? []) {
          const material = m.material as InstanceType<typeof THREE.MeshStandardMaterial>;
          if (on) {
            const lit = material.clone();
            lit.emissive.set("#ffffff");
            lit.emissiveIntensity = 0.18;
            m.userData.base = material;
            m.material = lit;
          } else if (m.userData.base) {
            (m.material as InstanceType<typeof THREE.Material>).dispose();
            m.material = m.userData.base;
            delete m.userData.base;
          }
        }
      };
      const pick = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables, false)[0];
        return { index: hit ? (hit.object.userData.index as number) : -1, r };
      };
      const onMove = (e: PointerEvent) => {
        const { index, r } = pick(e);
        if (index !== hovered) {
          if (hovered >= 0) highlight(hovered, false);
          if (index >= 0) highlight(index, true);
          hovered = index;
        }
        renderer.domElement.style.cursor = index >= 0 && days[index].href ? "pointer" : "grab";
        setHover(index >= 0 ? { day: days[index], x: e.clientX - r.left, y: e.clientY - r.top } : null);
      };
      const onLeave = () => {
        if (hovered >= 0) highlight(hovered, false);
        hovered = -1;
        setHover(null);
      };
      let down = { x: 0, y: 0 };
      const onDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY };
        controls.autoRotate = false;
      };
      const onUp = (e: PointerEvent) => {
        // A click, not a drag: open the day in the log.
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const { index } = pick(e);
        const href = index >= 0 ? days[index].href : null;
        if (href) router.push(href);
      };
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerleave", onLeave);
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      // Callout arrows: project each called-out tower's top to the screen and draw a curve from its card.
      const v = new THREE.Vector3();
      const drawCallouts = () => {
        calloutsRef.current.forEach((index, k) => {
          if (index < 0) return;
          const a = anchors.get(index);
          const card = cardRefs.current[k];
          const path = pathRefs.current[k];
          const dot = dotRefs.current[k];
          if (!a || !card || !path || !dot) return;
          const shown = card.offsetParent !== null;
          v.set(a.x, 0.08 + a.h * (a.group ? a.group.scale.y : 1) + 0.05, a.z).project(camera);
          if (!shown || v.z > 1) {
            path.style.opacity = "0";
            dot.style.opacity = "0";
            return;
          }
          const tx = ((v.x + 1) / 2) * width;
          const ty = ((1 - v.y) / 2) * height;
          const left = card.offsetLeft;
          const top = card.offsetTop;
          const cw = card.offsetWidth;
          const ch = card.offsetHeight;
          const ax = tx > left + cw / 2 ? left + cw : left;
          const ay = Math.min(Math.max(ty, top + 14), top + ch - 14);
          const mx = ax + (tx - ax) * 0.55;
          path.setAttribute("d", `M ${ax} ${ay} Q ${mx} ${ay} ${tx} ${ty}`);
          dot.setAttribute("cx", String(tx));
          dot.setAttribute("cy", String(ty));
          path.style.opacity = "1";
          dot.style.opacity = "1";
        });
      };

      // Playback: a red ring marks the day being stacked; the HUD counts the hours stacked so far.
      const span = lastIndex + 1;
      const cumulative: number[] = [];
      days.forEach((d, i) => cumulative.push((cumulative[i - 1] ?? 0) + totalMinutes(d)));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.6, 48),
        mat("#d8121f", { emissive: "#ff3c50", emissiveIntensity: 0.8, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      let shownHead = -2;
      const showHud = (head: number) => {
        if (head === shownHead) return;
        shownHead = head;
        const dayEl = hudDayRef.current;
        const hoursEl = hudHoursRef.current;
        if (!dayEl || !hoursEl) return;
        if (head < 0) {
          dayEl.textContent = restLabel;
          hoursEl.textContent = `${fmtHours(totalStacked * 60)}h stacked`;
          return;
        }
        dayEl.textContent = `Day ${days[head].day} · ${fmtDay(days[head].date)}`;
        hoursEl.textContent = `${fmtHours(cumulative[head] * 60)}h stacked`;
      };
      // Callouts that follow the playback: every CALLOUT_MS the newest stacked day (a day with a photo
      // first, so the cards cycle through photos) takes the next slot in turn, replacing the oldest card.
      const trained = days.map((d, i) => (d.sessions.length > 0 && i <= lastIndex ? i : -1)).filter((i) => i >= 0);
      let lastCalloutAt = -Infinity;
      let nextSlot = 0;
      let lastHead = -1;
      const setSlots = (slots: number[]) => {
        calloutsRef.current = slots;
        setCallouts(slots);
      };
      const followTrail = (head: number, now: number) => {
        if (head < lastHead) {
          // A new pass from day one: clear the cards.
          setSlots(SLOTS.map(() => -1));
          nextSlot = 0;
          lastCalloutAt = -Infinity;
        }
        lastHead = head;
        if (now - lastCalloutAt < CALLOUT_MS) return;
        const shown = new Set(calloutsRef.current);
        const stacked = trained.filter((i) => i <= head && !shown.has(i));
        if (stacked.length === 0) return;
        const recent = stacked.slice(-8);
        const pick = [...recent].reverse().find((i) => days[i].photo) ?? recent[recent.length - 1];
        const slots = calloutsRef.current.length === SLOTS.length ? [...calloutsRef.current] : SLOTS.map(() => -1);
        slots[nextSlot] = pick;
        nextSlot = (nextSlot + 1) % SLOTS.length;
        lastCalloutAt = now;
        setSlots(slots);
      };

      // Playback clock: advances only while playing (and on screen), so pause freezes in place.
      const STEP_MS = Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, BUILD_MS / Math.max(1, span)));
      const RISE_MS = Math.min(520, Math.max(220, STEP_MS * 1.25));
      const REWIND_STEP_MS = Math.min(70, REWIND_MS / Math.max(1, span));
      const REWIND_RISE_MS = 260;
      const buildEnd = Math.max(0, span - 1) * STEP_MS + RISE_MS;
      const rewindEnd = Math.max(0, span - 1) * REWIND_STEP_MS + REWIND_RISE_MS;
      const cycle = buildEnd + HOLD_MS + rewindEnd;
      let elapsed = 0;
      let lastNow = -1;
      const setProgress = (f: number) => {
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, f))})`;
      };

      // Run only while on screen.
      let visible = true;
      let frame = 0;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!visible) {
          frame = 0;
          lastNow = -1;
          return;
        }
        frame = requestAnimationFrame(tick);
        const t = now - t0;
        const dt = lastNow < 0 ? 0 : Math.min(100, now - lastNow);
        lastNow = now;
        if (restartRef.current) {
          restartRef.current = false;
          elapsed = 0;
        }
        if (reduced || span === 0) {
          for (const g of groups) {
            g.group.scale.y = 1;
            g.group.visible = true;
          }
          ring.visible = false;
          showHud(-1);
          setProgress(1);
        } else {
          if (playingRef.current) {
            elapsed += dt;
            if (loopingRef.current) {
              elapsed %= cycle;
            } else if (elapsed >= buildEnd) {
              // Play once: stop on the finished skyline.
              elapsed = buildEnd;
              playingRef.current = false;
              setPlaying(false);
              setEnded(true);
            }
          }
          const tc = elapsed;
          let head: number;
          if (tc < buildEnd + HOLD_MS) {
            // Stack day by day from day 1 to today, then hold.
            for (const g of groups) {
              const p = Math.min(1, Math.max(0, (tc - g.index * STEP_MS) / RISE_MS));
              g.group.scale.y = p <= 0 ? 0.0001 : Math.max(0.0001, easeOutBack(p));
              // Unstacked towers are hidden, not squashed flat (which smudges the tiles).
              g.group.visible = p > 0;
            }
            head = Math.min(span - 1, Math.floor(tc / STEP_MS));
            setProgress(tc / buildEnd);
            followTrail(head, now);
          } else {
            // Rewind: the newest day retracts first, back to day 1.
            const rt = tc - buildEnd - HOLD_MS;
            for (const g of groups) {
              const order = span - 1 - g.index;
              const p = Math.min(1, Math.max(0, (rt - order * REWIND_STEP_MS) / REWIND_RISE_MS));
              g.group.scale.y = Math.max(0.0001, 1 - p * p);
              g.group.visible = p < 1;
            }
            head = Math.max(0, span - 1 - Math.floor(rt / REWIND_STEP_MS));
            setProgress(1 - rt / rewindEnd);
          }
          const a = anchors.get(head);
          if (a) {
            ring.visible = true;
            ring.position.set(a.x, 0.1, a.z);
            (ring.material as InstanceType<typeof THREE.MeshStandardMaterial>).opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t / 160));
          }
          showHud(head);
        }
        if (!reduced) {
          const pulse = 0.5 + 0.5 * Math.sin(t / 520);
          (cap.material as InstanceType<typeof THREE.MeshStandardMaterial>).emissiveIntensity = 0.6 + 0.6 * pulse;
        }
        controls.update();
        renderer.render(scene, camera);
        drawCallouts();
      };
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(tick);
      });
      io.observe(el);
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        if (frame) cancelAnimationFrame(frame);
        io.disconnect();
        ro.disconnect();
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerleave", onLeave);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.dispose();
        scene.traverse((o) => {
          const mesh = o as InstanceType<typeof THREE.Mesh>;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        for (const m of mats) m.dispose();
        for (const t of textures) t.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [days, router, variant, lastIndex, restLabel, totalStacked]);

  const size = variant === "hero" ? "h-[460px] sm:h-[560px]" : "h-[62vh] min-h-[420px] sm:h-[70vh]";

  return (
    <div className={`relative w-full ${size}`}>
      <div ref={mount} className="absolute inset-0" aria-hidden="true" />

      {/* Callout arrows, redrawn every frame from the projected tower tops. */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <marker
            id={`arrow-${markerId}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#141414" />
          </marker>
        </defs>
        {callouts.map((index, k) =>
          index < 0 ? null : (
          <g key={`${k}-${index}`}>
            <path
              ref={(n) => {
                pathRefs.current[k] = n;
              }}
              fill="none"
              stroke="#141414"
              strokeWidth="1.25"
              strokeDasharray="4 4"
              markerEnd={`url(#arrow-${markerId})`}
              style={{ opacity: 0, transition: "opacity 200ms" }}
            />
            <circle
              ref={(n) => {
                dotRefs.current[k] = n;
              }}
              r="5"
              fill="none"
              stroke="#d8121f"
              strokeWidth="1.5"
              style={{ opacity: 0 }}
            />
          </g>
          ),
        )}
      </svg>

      {callouts.map((index, k) =>
        index < 0 ? null : (
        <CalloutCard
          key={`${k}-${index}`}
          day={days[index]}
          className={`rise ${SLOTS[k]}`}
          cardRef={(n) => {
            cardRefs.current[k] = n;
          }}
        />
        ),
      )}

      {/* Playback: play / pause / replay, loop on or off, the running count and a progress bar. */}
      {/* Centred at the bottom so it never covers the weekday labels on the left. */}
      <div className="absolute bottom-3 left-1/2 z-10 w-[min(320px,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl bg-paper/92 p-2 pr-3 shadow-[0_0_0_1px_rgba(20,20,20,0.07),0_10px_24px_-12px_rgba(20,20,20,0.35)] backdrop-blur sm:bottom-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (ended) {
                restartRef.current = true;
                setEnded(false);
              }
              playingRef.current = !playingRef.current || ended;
              setPlaying(playingRef.current);
            }}
            aria-label={ended ? "Replay from day one" : playing ? "Pause" : "Play"}
            title={ended ? "Replay" : playing ? "Pause" : "Play"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-transform active:scale-95 motion-reduce:hidden"
          >
            {ended ? (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8a5 5 0 1 0 1.6-3.7" />
                <path d="M3 2.5v3h3" />
              </svg>
            ) : playing ? (
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
                <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden="true">
                <path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              loopingRef.current = !loopingRef.current;
              setLooping(loopingRef.current);
            }}
            aria-pressed={looping}
            aria-label={looping ? "Looping: on. Turn off to stop at the end" : "Looping: off. Turn on to repeat"}
            title={looping ? "Loop on" : "Loop off"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:hidden ${
              looping ? "bg-red text-paper" : "text-ink-faint shadow-[0_0_0_1px_var(--rule)] hover:text-ink"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 7V6a2.5 2.5 0 0 1 2.5-2.5h7.5" />
              <path d="M10.5 1.5l2 2-2 2" />
              <path d="M13.5 9v1a2.5 2.5 0 0 1-2.5 2.5H3.5" />
              <path d="M5.5 14.5l-2-2 2-2" />
            </svg>
          </button>
          <span className="min-w-0 leading-tight">
            <span ref={hudDayRef} className="label block truncate !text-[0.66rem] !text-ink sm:!text-[0.7rem]">
              {restLabel}
            </span>
            <span ref={hudHoursRef} className="label block truncate !text-[0.62rem] sm:!text-[0.66rem]">
              {fmtHours(totalStacked * 60)}h stacked
            </span>
          </span>
        </div>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[rgba(20,20,20,0.08)]" aria-hidden="true">
          <span ref={progressRef} className="block h-full origin-left rounded-full bg-red" style={{ transform: "scaleX(1)" }} />
        </span>
      </div>

      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center font-serif text-ink-soft">
          This view needs WebGL, which this browser does not have turned on.
        </p>
      ) : null}
      {hover ? <Tooltip hover={hover} /> : null}
    </div>
  );
}

/** A called-out day: its photo when it has one, the sports, the date and the first session. */
function CalloutCard({
  day,
  className,
  cardRef,
}: {
  day: SkylineDay;
  className: string;
  cardRef: (n: HTMLElement | null) => void;
}) {
  const sports = [...new Set(day.sessions.map((s) => s.sport))];
  const first = day.sessions[0];
  const body = (
    <>
      {day.photo ? (
        <span className="relative block h-16 w-full overflow-hidden rounded-lg bg-desk sm:h-24">
          <Image src={day.photo.url} alt={day.photo.alt} fill sizes="200px" className="object-cover" />
        </span>
      ) : null}
      <span className={`flex flex-wrap items-center gap-1 ${day.photo ? "mt-2" : ""}`}>
        {sports.map((s) => (
          <SportPill key={s} sport={s} />
        ))}
      </span>
      <span className="label mt-1.5 block !text-[0.62rem] !text-ink sm:!text-[0.66rem]">
        Day {day.day} · {fmtDay(day.date)}
      </span>
      {first ? (
        <span className="mt-0.5 line-clamp-2 block font-serif text-[0.82rem] leading-snug text-ink-soft sm:text-[0.88rem]">
          {first.name}
        </span>
      ) : null}
      <span className="label mt-1 block !text-[0.62rem]">{fmtHM(totalMinutes(day) * 60)}</span>
    </>
  );
  const cls = `absolute z-10 w-[148px] rounded-xl bg-paper/95 p-2 text-left shadow-[0_0_0_1px_rgba(20,20,20,0.07),0_14px_30px_-14px_rgba(20,20,20,0.35)] backdrop-blur transition-transform hover:-translate-y-0.5 sm:w-[196px] sm:p-2.5 ${className}`;
  return day.href ? (
    <Link href={day.href} ref={cardRef} className={cls}>
      {body}
    </Link>
  ) : (
    <div ref={cardRef} className={cls}>
      {body}
    </div>
  );
}

function Tooltip({ hover }: { hover: Hover }) {
  const d = hover.day;
  const total = totalMinutes(d);
  return (
    <div
      className="pointer-events-none absolute z-20 w-max max-w-[260px] rounded-xl bg-paper/95 px-3.5 py-2.5 shadow-[0_0_0_1px_rgba(20,20,20,0.08),0_12px_28px_-12px_rgba(20,20,20,0.35)] backdrop-blur"
      style={{ left: hover.x, top: Math.max(8, hover.y - 18), transform: "translate(-50%, -100%)" }}
    >
      <div className="label !text-ink">
        Day {d.day} · {fmtDay(d.date)}
      </div>
      {d.sessions.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {d.sessions.map((s, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[0.85rem] leading-snug">
              <span className="font-mono text-[0.62rem] font-bold tracking-[0.1em]" style={{ color: COLOR[s.sport] }}>
                {pillLabel[s.sport]}
              </span>
              <span className="text-ink">{fmtHM(s.minutes * 60)}</span>
            </li>
          ))}
          <li className="label pt-0.5 !text-[0.66rem]">{fmtHM(total * 60)} total · click to open</li>
        </ul>
      ) : (
        <div className="mt-1 font-serif text-[0.9rem] text-ink-soft">
          {d.when === "future" ? "Still to come." : d.when === "today" ? "Today, nothing logged yet." : "Rest day."}
        </div>
      )}
    </div>
  );
}
