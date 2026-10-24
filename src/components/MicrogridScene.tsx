import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HouseholdView, Trade, WeatherSlot } from '../../shared/types';
import { fmtTime, fmtKwh } from '../lib/format';
import { Dot } from './ui';

const SCALE = 0.62;

function localHourFloat(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, '#101a16');
  grad.addColorStop(0.55, '#0a100e');
  grad.addColorStop(1, '#060908');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

export default function MicrogridScene({
  households,
  trades,
  clock,
  timezone,
  weather,
  selectedId,
  onSelect,
  onOpenAgent,
}: {
  households: HouseholdView[];
  trades: Trade[];
  clock: string;
  timezone: string;
  weather: WeatherSlot | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenAgent: (id: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const selectedRef = useRef<string | null>(selectedId);
  const selectCb = useRef(onSelect);
  const ringRef = useRef<THREE.Mesh | null>(null);
  const sunRef = useRef<THREE.Mesh | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientRef = useRef<THREE.HemisphereLight | null>(null);
  const flowsGroupRef = useRef<THREE.Group | null>(null);
  const houseGroups = useRef<Record<string, THREE.Group>>({});
  const flowCurves = useRef<{ curve: THREE.QuadraticBezierCurve3; particle: THREE.Mesh; offset: number }[]>([]);

  selectCb.current = onSelect;
  selectedRef.current = selectedId;

  const flowSignature = useMemo(
    () =>
      trades
        .filter((t) => t.source !== 'grid')
        .slice(0, 10)
        .map((t) => `${t.buyerId}-${t.sellerId}-${t.qtyKwh}`)
        .join('|'),
    [trades],
  );

  const hour = localHourFloat(clock, timezone);
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const tradeKey = flowSignature;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060908');
    scene.fog = new THREE.FogExp2('#060908', 0.023);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    camera.position.set(0, 13.5, 17.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 12;
    controls.maxDistance = 30;
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = 1.18;
    controls.autoRotate = false;
    controls.target.set(0, 0.5, 0);

    const ambient = new THREE.HemisphereLight('#9fd8c2', '#080c0a', 0.55);
    scene.add(ambient);
    ambientRef.current = ambient;

    const sunLight = new THREE.DirectionalLight('#ffe6b8', 2.1);
    sunLight.position.set(8, 16, 6);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -18;
    sunLight.shadow.camera.right = 18;
    sunLight.shadow.camera.top = 18;
    sunLight.shadow.camera.bottom = -18;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.bias = -0.0006;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const fill = new THREE.PointLight('#5ce1a8', 10, 22, 2);
    fill.position.set(0, 5, 0);
    scene.add(fill);

    // ---- ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(19, 72),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(36, 36, '#1d2c26', '#111a17');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.32;
    grid.position.y = 0.012;
    scene.add(grid);

    const rim = new THREE.Mesh(
      new THREE.RingGeometry(11.35, 11.42, 128),
      new THREE.MeshBasicMaterial({ color: '#2b473b', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    scene.add(rim);

    // ---- selection ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.14, 64),
      new THREE.MeshBasicMaterial({ color: '#5CE1A8', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    scene.add(ring);
    ringRef.current = ring;

    // ---- trees
    const treeGeo = new THREE.ConeGeometry(0.34, 1.15, 6);
    const treeMat = new THREE.MeshStandardMaterial({ color: '#14261f', roughness: 0.9, flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.4, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#241d16', roughness: 1 });
    const treeRng = mulberry(9173);
    for (let i = 0; i < 22; i++) {
      const angle = treeRng() * Math.PI * 2;
      const radius = 8.6 + treeRng() * 2.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.65 + treeRng() * 0.7;
      const tree = new THREE.Mesh(treeGeo, treeMat);
      tree.position.set(x, 0.75 * scale, z);
      tree.scale.setScalar(scale);
      tree.castShadow = true;
      scene.add(tree);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 0.2 * scale, z);
      trunk.scale.setScalar(scale);
      scene.add(trunk);
    }

    // ---- houses
    const clickable: THREE.Object3D[] = [];
    for (const household of households) {
      const group = new THREE.Group();
      const isBattery = household.id === 'h9';
      const x = household.position.x * SCALE;
      const z = household.position.z * SCALE;
      group.position.set(x, 0, z);

      if (isBattery) {
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.12, 1.25, 24),
          new THREE.MeshStandardMaterial({ color: '#1b2a24', roughness: 0.55, metalness: 0.35 }),
        );
        body.position.y = 0.62;
        body.castShadow = true;
        group.add(body);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(1.06, 1.06, 0.06, 24),
          new THREE.MeshStandardMaterial({ color: household.color, emissive: household.color, emissiveIntensity: 1.1 }),
        );
        cap.position.y = 1.27;
        group.add(cap);
        const vent = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.78, 32),
          new THREE.MeshBasicMaterial({ color: '#5CE1A8', transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
        );
        vent.rotation.x = -Math.PI / 2;
        vent.position.y = 1.31;
        group.add(vent);
        // solar canopy
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.045, 1.2),
          new THREE.MeshStandardMaterial({ color: '#153247', metalness: 0.65, roughness: 0.28 }),
        );
        canopy.position.set(0, 1.55, 1.35);
        canopy.rotation.x = -0.22;
        canopy.castShadow = true;
        group.add(canopy);
        for (let i = -2; i <= 2; i++) {
          const strut = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.55, 0.04),
            new THREE.MeshStandardMaterial({ color: '#2a3b34' }),
          );
          strut.position.set(i * 0.55, 1.3, 1.35);
          group.add(strut);
        }
      } else {
        const w = 1.45;
        const d = 1.25;
        const h = 0.72 + (household.id.charCodeAt(1) % 3) * 0.07;
        const bodyMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(household.color).multiplyScalar(0.16).add(new THREE.Color('#121a17')),
          roughness: 0.85,
          metalness: 0.05,
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
        body.position.y = h / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.14, 0.07, d + 0.14),
          new THREE.MeshStandardMaterial({ color: '#0f1714', roughness: 0.9 }),
        );
        roof.position.y = h + 0.035;
        roof.castShadow = true;
        group.add(roof);

        // solar array
        const panelMat = new THREE.MeshStandardMaterial({
          color: '#173a52',
          emissive: '#1d5f7a',
          emissiveIntensity: 0.35,
          metalness: 0.7,
          roughness: 0.25,
        });
        const panelCount = household.pvKwp > 7 ? 3 : household.pvKwp > 4 ? 2 : 1;
        for (let i = 0; i < panelCount; i++) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.035, 0.55), panelMat);
          panel.position.set((i - (panelCount - 1) / 2) * 0.4, h + 0.125, -0.12);
          panel.rotation.x = -0.16;
          panel.castShadow = true;
          group.add(panel);
        }

        // warm windows
        const windowMat = new THREE.MeshBasicMaterial({ color: '#f6c479', transparent: true, opacity: 0.9 });
        const win1 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24), windowMat);
        win1.position.set(-0.28, h * 0.62, d / 2 + 0.006);
        group.add(win1);
        const win2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), windowMat);
        win2.position.set(0.38, h * 0.5, d / 2 + 0.006);
        group.add(win2);
        const door = new THREE.Mesh(
          new THREE.PlaneGeometry(0.22, 0.4),
          new THREE.MeshBasicMaterial({ color: '#25342d' }),
        );
        door.position.set(0.05, 0.2, d / 2 + 0.004);
        group.add(door);

        // address post
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.34, 5),
          new THREE.MeshBasicMaterial({ color: '#3a4a43' }),
        );
        post.position.set(-0.75, 0.17, d / 2 + 0.2);
        group.add(post);
      }

      group.userData.householdId = household.id;
      scene.add(group);
      houseGroups.current[household.id] = group;
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.userData.householdId = household.id;
          clickable.push(child);
        }
      });
    }

    // ---- energy flows
    const flows = new THREE.Group();
    scene.add(flows);
    flowsGroupRef.current = flows;

    // ---- sun / moon
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#ffd79a' }),
    );
    scene.add(sun);
    sunRef.current = sun;
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#f5b84a', transparent: true, opacity: 0.08 }),
    );
    sun.add(halo);

    // ---- interaction
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (Math.abs(event.clientX - downX) > 5 || Math.abs(event.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickable, false);
      if (hits.length) {
        const id = hits[0].object.userData.householdId as string;
        selectCb.current(id);
      } else {
        selectCb.current(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerenter', () => {
      renderer.domElement.style.cursor = 'grab';
    });

    // ---- resize
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      if (w / h < 1.15) {
        camera.position.set(0, 16.5, 22);
      } else if (camera.position.length() > 28) {
        camera.position.set(0, 13.5, 17.5);
      }
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // ---- loop
    let raf = 0;
    const clock3 = new THREE.Clock();
    const labelTarget = new THREE.Vector3();
    const project = (id: string, x: number, y: number, z: number) => {
      const el = labelRefs.current[id];
      if (!el) return;
      labelTarget.set(x, y, z).project(camera);
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const sx = (labelTarget.x * 0.5 + 0.5) * w;
      const sy = (-labelTarget.y * 0.5 + 0.5) * h;
      if (labelTarget.z > 1) {
        el.style.opacity = '0';
        return;
      }
      el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`;
      el.style.opacity = '1';
    };

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock3.getElapsedTime();
      controls.update();
      for (const flow of flowCurves.current) {
        const p = (t * 0.085 + flow.offset) % 1;
        flow.particle.position.copy(flow.curve.getPoint(p));
        (flow.particle.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(p * Math.PI);
      }
      for (const household of households) {
        const group = houseGroups.current[household.id];
        if (!group) continue;
        project(
          household.id,
          group.position.x,
          household.id === 'h9' ? 2.35 : 1.55,
          group.position.z,
        );
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose?.();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else (mat as THREE.Material | undefined)?.dispose?.();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      houseGroups.current = {};
      flowCurves.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selection ring
  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    if (!selectedId) {
      ring.visible = false;
      return;
    }
    const h = households.find((x) => x.id === selectedId);
    if (!h) return;
    ring.visible = true;
    ring.position.x = h.position.x * SCALE;
    ring.position.z = h.position.z * SCALE;
  }, [selectedId, households]);

  // daylight + sun position
  useEffect(() => {
    const sun = sunRef.current;
    const light = sunLightRef.current;
    const ambient = ambientRef.current;
    if (!sun || !light || !ambient) return;
    const angle = ((hour - 6) / 12) * Math.PI;
    const x = Math.cos(angle) * 20;
    const y = Math.sin(angle) * 15 + 1;
    const z = -9;
    sun.position.set(x, y, z);
    sun.visible = daylight > 0.06;
    (sun.material as THREE.MeshBasicMaterial).color.set(daylight < 0.25 ? '#ffe3b0' : '#ffd79a');
    light.position.set(x, Math.max(2, y), z + 4);
    light.intensity = 0.35 + daylight * 2.2;
    light.color.set(daylight < 0.22 ? '#ffb37a' : '#ffe6b8');
    ambient.intensity = 0.28 + daylight * 0.45;
  }, [hour, daylight]);

  // rebuild flows when trades change
  useEffect(() => {
    const group = flowsGroupRef.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    flowCurves.current = [];
    const active = trades.filter((t) => t.source !== 'grid').slice(0, 8);
    const seen = new Set<string>();
    let acceptable = 0;
    for (const trade of active) {
      const key = `${trade.sellerId}-${trade.buyerId}`;
      if (seen.has(key) && active.length < 4) continue;
      seen.add(key);
      const seller = households.find((h) => h.id === trade.sellerId);
      const buyer = households.find((h) => h.id === trade.buyerId);
      if (!seller || !buyer) continue;
      const from = new THREE.Vector3(seller.position.x * SCALE, seller.id === 'h9' ? 1.5 : 0.95, seller.position.z * SCALE);
      const to = new THREE.Vector3(buyer.position.x * SCALE, buyer.id === 'h9' ? 1.5 : 0.95, buyer.position.z * SCALE);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      mid.y = 2.6 + from.distanceTo(to) * 0.12;
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const points = curve.getPoints(36);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const color = seller.id === 'h9' ? '#F5B84A' : '#5CE1A8';
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 });
      group.add(new THREE.Line(geometry, material));

      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      group.add(particle);
      flowCurves.current.push({ curve, particle, offset: acceptable * 0.17 });
      acceptable += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeKey]);

  const selected = selectedId ? households.find((h) => h.id === selectedId) : null;
  const totalNet = households.reduce((s, h) => s + h.currentNetKw, 0);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#060908]">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5">
        <div className="pointer-events-auto">
          <div className="eyebrow mb-1">Live topology · Cedar Hollow</div>
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-medium tracking-[-0.01em] text-white/90">Neighbourhood microgrid</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-mint-500/20 bg-mint-500/[0.07] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-mint-400">
              <Dot pulse /> live
            </span>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/40 px-3 py-2 backdrop-blur-md">
            <div className="text-right">
              <div className="eyebrow text-[8.5px]">Local time</div>
              <div className="num text-[12px] text-white/85">{fmtTime(clock, timezone)}</div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="text-right">
              <div className="eyebrow text-[8.5px]">Weather</div>
              <div className="num text-[12px] text-white/85">
                {weather ? `${weather.tempC.toFixed(0)}°C · ${weather.cloudPct.toFixed(0)}% cloud` : '—'}
              </div>
            </div>
          </div>
          <div className="w-[236px] rounded-xl border border-white/[0.07] bg-black/45 p-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Grid net position</span>
              <span className={`num text-[13px] ${totalNet >= 0 ? 'text-mint-400' : 'text-solar'}`}>
                {totalNet >= 0 ? '+' : ''}
                {totalNet.toFixed(1)} kW
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={`h-full rounded-full ${totalNet >= 0 ? 'bg-mint-400' : 'bg-solar'}`}
                style={{ width: `${Math.min(100, (Math.abs(totalNet) / 24) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-white/30">
              <span>import</span>
              <span>{totalNet >= 0 ? 'exporting to neighbours' : 'drawing from grid'}</span>
            </div>
          </div>
        </div>
      </div>

      {!selected && (
        <div className="pointer-events-none absolute bottom-4 left-5 z-10 flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-400" /> p2p delivery
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-solar" /> battery flow
          </span>
          <span className="text-white/20">click a home · drag to orbit</span>
        </div>
      )}

      {selected && (
        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-end justify-between gap-3 sm:left-5 sm:right-5">
          <div className="panel w-full max-w-[420px] border-white/[0.1] bg-black/70 p-3.5 backdrop-blur-xl fade-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full" style={{ background: selected.color }} />
                <span className="text-[13px] font-medium text-white/90">{selected.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">{selected.short}</span>
              </div>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                  selected.status === 'surplus' ? 'text-mint-400' : selected.status === 'deficit' ? 'text-solar' : 'text-white/50'
                }`}
              >
                {selected.status}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {[
                ['Net now', `${selected.currentNetKw >= 0 ? '+' : ''}${selected.currentNetKw.toFixed(1)} kW`],
                ['P2P today', fmtKwh(selected.todayP2pKwh, 1)],
                ['Revenue', `$${selected.todayRevenueUsd.toFixed(2)}`],
                ['MTR', selected.balanceMtr.toFixed(1)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/30">{label}</div>
                  <div className="num mt-1 text-[12.5px] text-white/85">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10.5px] text-white/35">
                {selected.pvKwp} kWp solar · {selected.batteryKwh} kWh storage
              </span>
              <button
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-mint-400 hover:text-mint-300"
                onClick={() => onOpenAgent(selected.id)}
              >
                open agent →
              </button>
            </div>
          </div>
          <button
            className="hidden shrink-0 rounded-md border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40 backdrop-blur hover:text-white/80 sm:block"
            onClick={() => onSelect(null)}
          >
            clear
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-0">
        {households.map((h) => (
          <div
            key={h.id}
            ref={(el) => {
              labelRefs.current[h.id] = el;
            }}
            className="absolute left-0 top-0 select-none whitespace-nowrap transition-opacity duration-300"
            style={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-1">
              <div
                className={`rounded-md border px-1.5 py-[3px] font-mono text-[8.5px] uppercase tracking-[0.08em] backdrop-blur-sm ${
                  h.status === 'surplus'
                    ? 'border-mint-500/20 bg-black/55 text-mint-300'
                    : h.status === 'deficit'
                      ? 'border-solar/20 bg-black/55 text-solar'
                      : 'border-white/10 bg-black/55 text-white/50'
                }`}
              >
                {h.name.replace(' House', '')}
                <span className="ml-1.5 opacity-60">
                  {h.currentNetKw >= 0 ? '+' : ''}
                  {h.currentNetKw.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
