/* 知识宇宙：糖果星系（Three.js 黏土质感星球 + 悬浮信息卡） */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import apiClient from '../api/axios';
import { ClayButton, ProgressBar, useToast } from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconClock, IconClose, IconPlay, IconRefresh } from '../components/ui/icons';

const CANDY = ['#FF8A80', '#7FD1B9', '#7CB8FF', '#FFD166', '#B79CFF', '#F49AC1'];
const GOLDEN = Math.PI * (1 + Math.sqrt(5));

// 连线颜色：与知识图谱页的关系类型保持一致
const LINK_COLOR = {
  reference: '#FF8A80',
  tag: '#7FD1B9',
  category: '#7CB8FF',
  day: '#B79CFF',
  auto: '#C9C4D6',
};

const DAY_MS = 24 * 60 * 60 * 1000;

// 连线图例：左侧档案栏用文字说明颜色，不让用户去猜
const LINK_LEGEND = [
  { type: 'reference', label: '正文互相引用' },
  { type: 'tag', label: '共用标签' },
  { type: 'category', label: '同一分类' },
  { type: 'day', label: '同一天创建' },
  { type: 'auto', label: '兜底连通' },
];

/* 取消某颗星球的高亮：材质只存基准色，重算发光色即可 */
function restoreMesh(mesh) {
  if (!mesh || !mesh.userData?.baseColor) return;
  mesh.material.emissive.copy(mesh.userData.baseColor.clone().multiplyScalar(0.16));
  mesh.material.emissiveIntensity = 0.9;
}

/* 已到期待复习的数量：放在组件外，避免在 render 里直接读时钟 */
function countDue(points) {
  const now = Date.now();
  return points.filter((kp) => {
    const at = kp.review?.dueAt ? new Date(kp.review.dueAt).getTime() : NaN;
    return !Number.isNaN(at) && at <= now;
  }).length;
}

/* 到期时间讲成人话：演示时比一串 ISO 字符串好读 */
function formatDue(dueAt) {
  if (!dueAt) return '明天复习';
  const diff = Math.round((new Date(dueAt).getTime() - Date.now()) / DAY_MS);
  if (Number.isNaN(diff)) return '明天复习';
  if (diff < 0) return `已逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今天到期';
  return `${diff} 天后复习`;
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 30px "PingFang SC", "Microsoft YaHei", sans-serif';
  canvas.width = 512;
  canvas.height = 128;
  if (ctx) {
    ctx.font = font;
    const width = Math.min(480, ctx.measureText(text).width + 48);
    const x = (canvas.width - width) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, 34, width, 60, 30);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = '#3D3A4B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, 64, width - 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(56, 14, 1);
  return sprite;
}

export default function KnowledgeUniversePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const groupRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const hoveredRef = useRef(null);
  const selectedMeshRef = useRef(null);
  // 供左侧档案栏反查星球：不关心 React 渲染，只用于聚焦与高亮
  const meshesByIdRef = useRef(new Map());
  const filterRef = useRef(null);
  const focusTargetRef = useRef(null);

  const [points, setPoints] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [cardCounts, setCardCounts] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);
  // null 表示未手动拖动过：默认展示全部（避免把「开局空星系」当成 bug）
  const [revealInput, setRevealInput] = useState(null);
  const [playing, setPlaying] = useState(false);
  const revealRef = useRef(Number.POSITIVE_INFINITY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 知识点取完整数据（信息卡需要正文），连线用图谱接口算好的关系
      const [pointsRes, graphRes, cardsRes] = await Promise.all([
        apiClient.get('/knowledge-points'),
        apiClient.get('/graph/knowledge-map'),
        // 闪卡数量只是信息卡的锦上添花，取不到不影响主流程
        apiClient.get('/flashcards').catch(() => ({ data: [] })),
      ]);
      setPoints(Array.isArray(pointsRes.data) ? pointsRes.data : []);
      setLinks(graphRes.data?.links || []);
      const counts = {};
      (cardsRes.data || []).forEach((card) => {
        const id = card?.knowledgePoint && String(card.knowledgePoint);
        if (id) counts[id] = (counts[id] || 0) + 1;
      });
      setCardCounts(counts);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载知识点失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /* 记录一次宇宙探索，用于「宇宙探索者」成就 */
  useEffect(() => {
    apiClient.post('/dashboard/explore').catch(() => {});
  }, []);

  /* 按「周」切分知识点，供时间轴回放使用（不按天切，避免节点多时帧率掉） */
  const weekBuckets = useMemo(() => {
    const items = points
      .map((kp) => ({ id: String(kp._id), at: new Date(kp.createdAt || 0) }))
      .filter((item) => !Number.isNaN(item.at.getTime()));
    if (!items.length) return { weeks: [], indexById: new Map() };

    const start = new Date(Math.min(...items.map((item) => item.at.getTime())));
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // 归到当周周一

    const indexById = new Map();
    const counts = [];
    items.forEach((item) => {
      const index = Math.max(0, Math.floor((item.at.getTime() - start.getTime()) / (7 * DAY_MS)));
      indexById.set(item.id, index);
      counts[index] = (counts[index] || 0) + 1;
    });

    const weeks = Array.from({ length: counts.length }, (_, index) => {
      const date = new Date(start.getTime() + index * 7 * DAY_MS);
      return {
        index,
        count: counts[index] || 0,
        label: `${date.getMonth() + 1}月${date.getDate()}日当周`,
      };
    });
    return { weeks, indexById };
  }, [points]);

  const totalWeeks = weekBuckets.weeks.length;
  const revealCount = revealInput == null ? totalWeeks : Math.min(revealInput, totalWeeks);
  const revealedPoints = useMemo(() => {
    if (revealCount >= totalWeeks) return points.length;
    return points.filter((kp) => (weekBuckets.indexById.get(String(kp._id)) ?? 0) < revealCount).length;
  }, [points, revealCount, totalWeeks, weekBuckets]);
  const currentWeek = weekBuckets.weeks[Math.max(0, revealCount - 1)];

  /* 每帧动画从 ref 读，避免因拖动滑块重建 Three.js 场景 */
  useEffect(() => {
    revealRef.current = revealCount;
  });

  /* 自动回放：每 650ms 点亮一周 */
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      if (revealRef.current >= totalWeeks) {
        setPlaying(false);
        return;
      }
      setRevealInput(Math.min(totalWeeks, revealRef.current + 1));
    }, 650);
    return () => clearInterval(id);
  }, [playing, totalWeeks]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (revealCount >= totalWeeks) setRevealInput(0); // 看完了就从头再长一次
    setPlaying(true);
  };

  /* 左侧星系档案：概览数字 / 分类分布 / 待加强星球 */
  const panelStats = useMemo(() => {
    const total = points.length;
    const avg = total
      ? Math.round(points.reduce((sum, kp) => sum + (Number(kp.mastery) || 0), 0) / total)
      : 0;
    const due = countDue(points);
    const cards = Object.values(cardCounts).reduce((sum, n) => sum + n, 0);
    return { total, avg, due, cards };
  }, [points, cardCounts]);

  const categoryGroups = useMemo(() => {
    const map = new Map();
    points.forEach((kp) => {
      const name = kp.category || '未分类';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [points]);

  const focusList = useMemo(() => {
    const pool = activeCategory
      ? points.filter((kp) => (kp.category || '未分类') === activeCategory)
      : points;
    return [...pool]
      .sort((a, b) => (Number(a.mastery) || 0) - (Number(b.mastery) || 0))
      .slice(0, 8)
      .map((kp) => {
        const index = points.findIndex((item) => String(item._id) === String(kp._id));
        return {
          ...kp,
          mastery: Math.round(Number(kp.mastery) || 0),
          tone: CANDY[(index < 0 ? 0 : index) % CANDY.length],
        };
      });
  }, [points, activeCategory]);

  /* 分类筛选只改 ref，不重建 Three.js 场景，靠每帧透明度渐变 */
  useEffect(() => {
    filterRef.current = activeCategory;
  }, [activeCategory]);

  const selectCategory = (name) => {
    setActiveCategory((current) => (current === name ? null : name));
    focusTargetRef.current = new THREE.Vector3(0, 0, 0);
  };

  /* 点档案栏：高亮星球 + 相机视线聚焦 + 弹出信息卡 */
  const focusPlanet = (kp) => {
    if (!kp) return;
    const mesh = meshesByIdRef.current.get(String(kp._id));
    if (mesh) {
      restoreMesh(selectedMeshRef.current);
      selectedMeshRef.current = mesh;
      mesh.material.emissive.set('#FFFFFF');
      mesh.material.emissiveIntensity = 0.55;
      focusTargetRef.current = mesh.position.clone();
      if (controlsRef.current) controlsRef.current.autoRotate = false;
    }
    // 时间轴没回放到底时星球是缩小的，点列表要先把它们亮出来
    if (revealCount < totalWeeks) setRevealInput(totalWeeks);
    setSelected(kp);
  };

  /* 初始化场景（只执行一次） */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 1, 2000);
    camera.position.set(0, 40, 300);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 160;
    controls.maxDistance = 520;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xfff6ea, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(180, 220, 260);
    scene.add(key);
    const warm = new THREE.PointLight(0xffc9b8, 0.9, 1200);
    warm.position.set(-220, -120, 160);
    scene.add(warm);

    // 星尘：糖果色小点
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 420;
    const positions = new Float32Array(dustCount * 3);
    const colors = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const r = 220 + Math.random() * 320;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.7;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const color = new THREE.Color(CANDY[i % CANDY.length]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // 中央暖光球（视觉锚点）
    const coreGeo = new THREE.SphereGeometry(16, 48, 48);
    const coreMat = new THREE.MeshStandardMaterial({
      color: '#FFD166',
      emissive: '#FFB84D',
      emissiveIntensity: 0.55,
      roughness: 0.75,
      metalness: 0.05,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const hovered = hoveredRef.current;
      const weekLimit = revealRef.current;
      core.scale.setScalar(1 + Math.sin(t * 1.6) * 0.06);
      dust.rotation.y = t * 0.02;

      nodesRef.current.forEach((mesh, i) => {
        // 基准位置 + 正弦偏移，避免逐帧累加把星球越飘越远
        const base = mesh.userData.basePos;
        if (base) mesh.position.y = base.y + Math.sin(t * 0.9 + i) * 1.4;

        // 时间轴回放：周序号小于游标才亮起，隐藏的星球缩到极小并全透明
        const shown = (mesh.userData.weekIndex ?? 0) < weekLimit;
        mesh.userData.revealed = shown;

        const categoryFilter = filterRef.current;
        const inFilter = !categoryFilter || (mesh.userData.kp.category || '未分类') === categoryFilter;
        const dimmed = shown && ((Boolean(hovered) && mesh !== hovered) || !inFilter);
        const targetScale = shown
          ? 1 + (mesh === hovered ? 0.26 : 0) + (mesh === selectedMeshRef.current ? 0.12 : 0)
          : 0.01;
        mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, targetScale, shown ? 0.16 : 0.28));

        const mat = mesh.material;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, shown ? (dimmed ? 0.14 : 1) : 0, 0.18);
        // 变透明的星球不写深度，否则会把后面的星球整块遮掉
        mat.depthWrite = mat.opacity > 0.55;

        const halo = mesh.userData.halo;
        if (halo) {
          halo.material.opacity = THREE.MathUtils.lerp(
            halo.material.opacity,
            shown ? (dimmed ? 0.04 : mesh === hovered ? 0.62 : 0.28) : 0,
            0.18,
          );
        }
        const label = mesh.userData.label;
        if (label) {
          label.material.opacity = THREE.MathUtils.lerp(
            label.material.opacity,
            shown ? (dimmed ? 0.12 : 1) : 0,
            0.18,
          );
        }
      });

      // 连线跟着星球一起晃；悬停时只留下与它相连的线；两端没点亮就不画
      edgesRef.current.forEach(({ line, a, b }) => {
        const shown = a.userData.revealed && b.userData.revealed;
        line.visible = Boolean(shown);
        if (!shown) return;
        const pos = line.geometry.getAttribute('position');
        pos.setXYZ(0, a.position.x, a.position.y, a.position.z);
        pos.setXYZ(1, b.position.x, b.position.y, b.position.z);
        pos.needsUpdate = true;
        const active = hovered && (a === hovered || b === hovered);
        const edgeFilter = filterRef.current;
        const inFilterEdge =
          !edgeFilter ||
          (a.userData.kp.category || '未分类') === edgeFilter ||
          (b.userData.kp.category || '未分类') === edgeFilter;
        const target = hovered ? (active ? 0.9 : 0.05) : inFilterEdge ? 0.3 : 0.06;
        line.material.opacity = THREE.MathUtils.lerp(line.material.opacity, target, 0.18);
      });

      // 相机视线缓缓移到被选中的星球上，不改变用户当前的观察距离
      const focusTarget = focusTargetRef.current;
      if (focusTarget) {
        controls.target.lerp(focusTarget, 0.06);
        if (controls.target.distanceTo(focusTarget) < 1) focusTargetRef.current = null;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      groupRef.current = null;
      nodesRef.current = [];
      edgesRef.current = [];
      hoveredRef.current = null;
      selectedMeshRef.current = null;
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  /* 数据变化时重建星球 */
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // 清空旧节点
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }
    nodesRef.current = [];
    edgesRef.current = [];
    hoveredRef.current = null;
    selectedMeshRef.current = null;
    meshesByIdRef.current = new Map();

    const total = points.length;
    if (!total) return;
    const radius = 108 + Math.min(total, 24) * 1.6;
    const meshById = new Map();

    points.forEach((kp, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / total);
      const theta = GOLDEN * (i + 0.5);
      const dist = radius + ((i % 5) - 2) * 12;
      const x = dist * Math.sin(phi) * Math.cos(theta);
      const y = dist * Math.cos(phi) * 0.82;
      const z = dist * Math.sin(phi) * Math.sin(theta);

      const mastery = Number(kp.mastery) || 0;
      const size = 9 + Math.min((kp.content || '').length / 220, 7) + mastery / 40;
      const color = new THREE.Color(CANDY[i % CANDY.length]);

      const geometry = new THREE.SphereGeometry(size, 48, 48);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0.04,
        emissive: color.clone().multiplyScalar(0.16),
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.userData = {
        kp,
        baseColor: color,
        baseSize: size,
        basePos: new THREE.Vector3(x, y, z),
        weekIndex: weekBuckets.indexById.get(String(kp._id)) ?? 0,
      };

      const haloGeo = new THREE.RingGeometry(size + 3, size + 5.4, 64);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = Math.PI / 2.2;
      mesh.add(halo);
      mesh.userData.halo = halo;

      group.add(mesh);
      nodesRef.current.push(mesh);
      meshById.set(String(kp._id), mesh);

      const label = makeLabel(kp.title.length > 14 ? `${kp.title.slice(0, 14)}…` : kp.title);
      label.position.set(x, y + size + 9, z);
      group.add(label);
      mesh.userData.label = label;
    });

    // 星球之间的连线：与知识图谱同一套关系数据
    links.forEach((link) => {
      const a = meshById.get(String(link.source));
      const b = meshById.get(String(link.target));
      if (!a || !b || a === b) return;
      const geometry = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
      const material = new THREE.LineBasicMaterial({
        color: LINK_COLOR[link.type] || LINK_COLOR.auto,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      group.add(line);
      edgesRef.current.push({ line, a, b, type: link.type });
    });

    meshesByIdRef.current = meshById;

    const controls = controlsRef.current;
    if (controls) {
      controls.autoRotate = true;
    }
  }, [points, links, weekBuckets]);

  /* 点击拾取星球 */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    // 还没被时间轴点亮的星球不参与拾取（缩小到 0.01 但几何体仍在）
    const pickables = () => nodesRef.current.filter((mesh) => mesh.userData.revealed !== false);

    const onClick = (event) => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!scene || !camera) return;

      const rect = mount.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(pickables(), false);
      restoreMesh(selectedMeshRef.current);

      if (hits.length) {
        const mesh = hits[0].object;
        selectedMeshRef.current = mesh;
        mesh.material.emissive.set('#FFFFFF');
        mesh.material.emissiveIntensity = 0.55;
        setSelected(mesh.userData.kp);
        if (controlsRef.current) controlsRef.current.autoRotate = false;
      } else {
        selectedMeshRef.current = null;
        setSelected(null);
        if (controlsRef.current) controlsRef.current.autoRotate = !hoveredRef.current;
      }
    };

    const onMove = (event) => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!scene || !camera) return;
      const rect = mount.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables(), false);
      hoveredRef.current = hits.length ? hits[0].object : null;
      mount.style.cursor = hits.length ? 'pointer' : 'grab';
      // 悬停时暂停自转，方便看清这颗星球和它的关系
      if (controlsRef.current && !selectedMeshRef.current) {
        controlsRef.current.autoRotate = !hoveredRef.current;
      }
    };

    const onLeave = () => {
      hoveredRef.current = null;
      mount.style.cursor = 'grab';
      if (controlsRef.current && !selectedMeshRef.current) {
        controlsRef.current.autoRotate = true;
      }
    };

    mount.addEventListener('click', onClick);
    mount.addEventListener('pointermove', onMove);
    mount.addEventListener('pointerleave', onLeave);
    return () => {
      mount.removeEventListener('click', onClick);
      mount.removeEventListener('pointermove', onMove);
      mount.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="universe-page">
      <aside className="universe-panel">
        <div className="universe-panel__head">
          <span className="universe-panel__title">星系档案</span>
          <span className="tag tag--mint">{panelStats.total} 颗星球</span>
        </div>

        <div className="universe-panel__stats">
          <div className="universe-panel__stat">
            <strong>{panelStats.avg}%</strong>
            <span>平均掌握</span>
          </div>
          <div className="universe-panel__stat">
            <strong>{panelStats.due}</strong>
            <span>到期复习</span>
          </div>
          <div className="universe-panel__stat">
            <strong>{panelStats.cards}</strong>
            <span>张闪卡</span>
          </div>
        </div>

        {categoryGroups.length > 0 ? (
          <div className="universe-panel__group">
            <span className="universe-panel__label">星群分类</span>
            <div className="universe-panel__chips">
              <button
                type="button"
                className={`universe-chip${activeCategory === null ? ' is-active' : ''}`}
                onClick={() => selectCategory(null)}
              >
                全部
              </button>
              {categoryGroups.map((group) => (
                <button
                  key={group.name}
                  type="button"
                  className={`universe-chip${activeCategory === group.name ? ' is-active' : ''}`}
                  onClick={() => selectCategory(group.name)}
                >
                  {group.name}
                  <em>{group.count}</em>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="universe-panel__group">
          <span className="universe-panel__label">待加强的星球</span>
          {focusList.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              这个分类下还没有知识点。
            </p>
          ) : (
            <div className="universe-panel__list">
              {focusList.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className={`universe-item${
                    selected && String(selected._id) === String(item._id) ? ' is-active' : ''
                  }`}
                  onClick={() => focusPlanet(item)}
                >
                  <span className="universe-item__dot" style={{ background: item.tone }} />
                  <span className="universe-item__body">
                    <span className="universe-item__title">{item.title}</span>
                    <span className="universe-item__bar">
                      <i style={{ width: `${item.mastery}%` }} />
                    </span>
                  </span>
                  <span className="universe-item__value">{item.mastery}%</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="universe-panel__legend">
          <span className="universe-panel__label">连线含义</span>
          {LINK_LEGEND.map((item) => (
            <span className="universe-panel__legend-item" key={item.type}>
              <i className="universe-panel__legend-line" style={{ background: LINK_COLOR[item.type] }} />
              {item.label}
            </span>
          ))}
        </div>
      </aside>

      <div className="universe">
        <div ref={mountRef} className="universe__canvas" aria-label="知识宇宙三维视图" />

        <div className="universe__hud">
          <span className="universe__badge">
            <AppIcon name="nav-universe" size={26} plain /> 糖果星系
          </span>
          <span className="universe__badge">{points.length} 颗知识星球</span>
          <span className="universe__badge">
            {loading ? '正在点亮…' : `${revealedPoints} / ${points.length} 已点亮`}
          </span>
          <div style={{ marginLeft: 'auto' }} className="row-8">
            <ClayButton variant="ghost" size="sm" onClick={load}>
              <IconRefresh size={15} /> 刷新
            </ClayButton>
          </div>
        </div>

        {!loading && points.length === 0 ? (
          <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center' }}>
            <AppIcon name="act-empty" size={96} round />
            <div className="empty__title">星系还是一片空白</div>
            <p className="empty__desc">新建知识点后，它们会在这里变成一颗颗糖果星球。</p>
            <ClayButton to="/kp/new">点亮第一颗星球</ClayButton>
          </div>
        ) : null}

        {selected ? (
          <div className="universe__info">
            <button
              type="button"
              className="universe__info-close"
              onClick={() => setSelected(null)}
              aria-label="关闭详情"
            >
              <IconClose size={14} />
            </button>
            <div className="universe__info-title">{selected.title}</div>
            <div className="row-8 wrap" style={{ marginBottom: 10 }}>
              <span className="tag tag--mint">{selected.category || '未分类'}</span>
              <span className="tag tag--lilac">掌握度 {selected.mastery || 0}%</span>
            </div>
            <div className="universe__info-mastery">
              <ProgressBar value={selected.mastery || 0} tone="mint" />
            </div>
            <ul className="universe__info-meta">
              <li>
                <IconClock size={13} /> {formatDue(selected.review?.dueAt)}
              </li>
              <li>{cardCounts[String(selected._id)] || 0} 张闪卡</li>
              <li>
                复述 {selected.stats?.feynmanCount || 0} · 测评 {selected.stats?.quizCount || 0} · 复习{' '}
                {selected.stats?.reviewCount || 0}
              </li>
            </ul>
            {selected.tags?.length ? (
              <div className="row-8 wrap" style={{ marginBottom: 10 }}>
                {selected.tags.slice(0, 6).map((tag) => (
                  <span key={tag} className="tag tag--butter">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="universe__info-desc">
              {selected.summary || selected.content || '这颗星球还没有记录内容。'}
            </div>
            <div className="universe__info-actions">
              <ClayButton size="sm" onClick={() => navigate(`/feynman/${selected._id}`)}>
                费曼复述
              </ClayButton>
              <ClayButton size="sm" variant="sky" onClick={() => navigate(`/quiz/${selected._id}`)}>
                随堂测评
              </ClayButton>
              <ClayButton size="sm" variant="ghost" onClick={() => navigate(`/kp/edit/${selected._id}`)}>
                编辑
              </ClayButton>
            </div>
          </div>
        ) : null}

        {totalWeeks > 1 ? (
          <div className="universe__timeline">
            <button
              type="button"
              className="universe__timeline-play"
              onClick={togglePlay}
              aria-label={playing ? '暂停回放' : '播放生长回放'}
            >
              <IconPlay size={14} /> {playing ? '暂停' : '回放'}
            </button>
            <input
              className="universe__timeline-range"
              type="range"
              min={0}
              max={totalWeeks}
              step={1}
              value={revealCount}
              onChange={(event) => {
                setPlaying(false);
                setRevealInput(Number(event.target.value));
              }}
              aria-label="按周回放知识点生长"
            />
            <span className="universe__timeline-label">
              {revealCount >= totalWeeks
                ? `全部 ${points.length} 颗`
                : `${currentWeek?.label || '第 1 周'} · ${revealedPoints} 颗`}
            </span>
          </div>
        ) : null}

        <div className="universe__hint">拖拽旋转 · 滚轮缩放 · 悬停高亮关系 · 点击星球查看知识点</div>
      </div>
    </div>
  );
}