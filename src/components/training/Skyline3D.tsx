"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SportBucket } from "@/lib/training/types";
import { fmtDay, fmtHM } from "./format";
import { pillLabel } from "./SportPill";
import type { SkylineDay } from "./skyline";
import { totalMinutes } from "./skyline";

/** Stack order, bottom to top, and the chart palette (sportFill, resolved for WebGL). */
const STACK: SportBucket[] = ["swim", "bike", "run", "strength"];
const COLOR: Record<SportBucket, string> = {
  swim: "#b4ada5",
  bike: "#d8121f",
  run: "#1f1f1f",
  strength: "#c08a3e",
};
/** Scene units per minute: a 150-minute day stands 3 units tall. */
const UNITS_PER_MIN = 3 / 150;
const MAX_HEIGHT = 7;
const TILE = 0.82;

interface Hover {
  day: SkylineDay;
  x: number;
  y: number;
}

/**
 * The training skyline: every day of the window as a tile on a 22 x 7 grid
 * (weeks by weekdays). Trained days rise as towers stacked by sport, height by
 * minutes; future days are faint tiles; race day is a red beacon at the end.
 * three.js loads only here, on the client. Drag to orbit, scroll to zoom,
 * hover for the day's sessions, click to open that day in the log. Reduced
 * motion: no auto-rotate and no rise-in.
 */
export function Skyline3D({ days }: { days: SkylineDay[] }) {
  const mount = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [hover, setHover] = useState<Hover | null>(null);
  const [failed, setFailed] = useState(false);

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

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      const scene = new THREE.Scene();
      const weeks = Math.max(...days.map((d) => d.week)) + 1;
      const cx = (weeks - 1) / 2;
      const cz = 3;

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
      // Open from the front-left, looking along the weeks toward race day, far enough back to frame the whole grid.
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
      const groups: { group: InstanceType<typeof THREE.Group>; delay: number; day: SkylineDay }[] = [];
      const dayMeshes = new Map<number, InstanceType<typeof THREE.Mesh>[]>();

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
        if (total > 0) {
          const group = new THREE.Group();
          group.position.set(x, 0.08, z);
          let y = 0;
          const scale = Math.min(1, MAX_HEIGHT / (total * UNITS_PER_MIN));
          for (const s of STACK) {
            const h = d.minutes[s] * UNITS_PER_MIN * scale;
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
          if (!reduced) group.scale.y = 0.0001;
          scene.add(group);
          groups.push({ group, delay: i * 18, day: d });
        }
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

      // Text labels as canvas sprites (month names along the front edge, race day above the beacon).
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
      const raceLabel = label("RACE DAY", "#d8121f", 0.5);
      raceLabel.position.set(race.week - cx, 5.15, race.weekday - cz);
      scene.add(raceLabel);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.4, 0.4);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 10;
      controls.maxDistance = 46;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = Math.PI / 2.15;
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = 0.55;
      controls.update();
      const baseDistance = camera.position.distanceTo(controls.target);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = `${w}px`;
        renderer.domElement.style.height = `${h}px`;
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
        // Narrow (portrait) views see less width, so back the camera off until the grid fits.
        const fit = camera.aspect < 1.2 ? Math.min(2, 1.15 / camera.aspect) : 1;
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
            m.material = material.clone();
            (m.material as InstanceType<typeof THREE.MeshStandardMaterial>).emissive.set("#ffffff");
            (m.material as InstanceType<typeof THREE.MeshStandardMaterial>).emissiveIntensity = 0.18;
            m.userData.base = material;
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

      const t0 = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        const t = now - t0;
        if (!reduced) {
          for (const g of groups) {
            const p = Math.min(1, Math.max(0, (t - 300 - g.delay) / 900));
            const eased = 1 - Math.pow(1 - p, 3);
            g.group.scale.y = Math.max(0.0001, eased);
          }
          const pulse = 0.5 + 0.5 * Math.sin(t / 520);
          (cap.material as InstanceType<typeof THREE.MeshStandardMaterial>).emissiveIntensity = 0.6 + 0.6 * pulse;
        }
        controls.update();
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(frame);
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
  }, [days, router]);

  return (
    <div className="relative h-[62vh] min-h-[420px] w-full sm:h-[70vh]">
      <div ref={mount} className="absolute inset-0" aria-hidden="true" />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center font-serif text-ink-soft">
          This view needs WebGL, which this browser does not have turned on.
        </p>
      ) : null}
      {hover ? <Tooltip hover={hover} /> : null}
    </div>
  );
}

function Tooltip({ hover }: { hover: Hover }) {
  const d = hover.day;
  const total = totalMinutes(d);
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[260px] -translate-x-1/2 rounded-xl bg-paper/95 px-3.5 py-2.5 shadow-[0_0_0_1px_rgba(20,20,20,0.08),0_12px_28px_-12px_rgba(20,20,20,0.35)] backdrop-blur"
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
