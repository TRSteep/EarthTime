import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CityTime } from "./backend";
import { sunPosition, toXYZ } from "./geo";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface Marker {
  city: CityTime;
  position: THREE.Vector3;
  dot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  label: HTMLButtonElement;
}

export class Globe {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  private readonly controls: OrbitControls;
  private readonly earthMaterial: THREE.ShaderMaterial;
  private readonly earth: THREE.Mesh;
  private readonly clouds: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshPhongMaterial
  >;
  private readonly sunlight = new THREE.DirectionalLight(0xffffff, 2);
  private readonly ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  private readonly labelLayer = document.createElement("div");
  private readonly markers: Marker[] = [];
  private readonly observer: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly screen = new THREE.Vector3();
  private readonly towardCamera = new THREE.Vector3();
  private readonly animationClock = new THREE.Clock();
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  private selectedID = "istanbul";
  private labelsVisible = true;
  private active = true;
  private frame = 0;
  private width = 1;
  private height = 1;
  private focusAnimation?: {
    start: number;
    direction: THREE.Vector3;
    rotation: THREE.Quaternion;
    distance: number;
  };
  private onRotateChange: (rotating: boolean) => void;

  constructor(
    private host: HTMLElement,
    cities: CityTime[],
    onSelect: (id: string) => void,
    onRotateChange: (rotating: boolean) => void,
  ) {
    this.onRotateChange = onRotateChange;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x050b13, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Трёхмерная Земля. Перетащите для вращения, используйте колесо для приближения.",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.host.append(this.renderer.domElement);
    this.labelLayer.className = "globe-labels";
    this.host.append(this.labelLayer);
    this.camera.position.set(...toXYZ(25, 25, 4.3));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.65;
    this.controls.maxDistance = 6;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener("start", () => this.setAutoRotate(false));

    const placeholder = new THREE.DataTexture(
      new Uint8Array([30, 70, 95, 255]),
      1,
      1,
    );
    placeholder.needsUpdate = true;
    this.earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: placeholder },
        nightMap: { value: placeholder },
        sunDirection: { value: new THREE.Vector3(...sunPosition(new Date())) },
        lightingEnabled: { value: 0 },
      },
      vertexShader,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform vec3 sunDirection;
        uniform float lightingEnabled;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 normal = normalize(vNormal);
          float sunlight = dot(normal, sunDirection);
          float night = 1.0 - smoothstep(-0.1045, 0.0523, sunlight);
          vec3 surface = texture2D(dayMap, vUv).rgb;
          vec3 lights = texture2D(nightMap, vUv).rgb;
          vec3 shaded = surface * (0.018 + 0.982 * max(sunlight, 0.0));
          shaded += lights * night * 1.5;
          vec3 color = mix(surface * 0.9, shaded, lightingEnabled);
          float rim = pow(1.0 - max(dot(normal, normalize(cameraPosition - vPosition)), 0.0), 4.0);
          color += vec3(0.08, 0.31, 0.46) * rim * 0.45;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const geometry = new THREE.SphereGeometry(1, 128, 64);
    this.earth = new THREE.Mesh(geometry, this.earthMaterial);
    this.scene.add(this.earth);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.009, 96, 48),
      new THREE.MeshPhongMaterial({
        color: 0xe5f6ff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    this.clouds.visible = false;
    this.scene.add(this.clouds, this.sunlight, this.ambientLight);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.055, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 view = normalize(cameraPosition - vPosition);
          float rim = pow(1.0 - abs(dot(normalize(vNormal), view)), 4.5);
          gl_FragColor = vec4(0.12, 0.48, 0.85, rim * 0.4);
          #include <colorspace_fragment>
        }
      `,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(atmosphere);
    this.addStars();

    for (const city of cities) {
      const position = new THREE.Vector3(...toXYZ(city.lat, city.lon, 1.018));
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x87efdf }),
      );
      dot.position.copy(position);
      dot.userData.cityID = city.id;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.011, 0.013, 32),
        new THREE.MeshBasicMaterial({
          color: 0x87efdf,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.position.copy(position);
      ring.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        position.clone().normalize(),
      );
      this.scene.add(dot, ring);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "city-label";
      label.dataset.city = city.id;
      label.innerHTML = "<span></span><strong></strong>";
      label.children[0].textContent = city.name;
      label.children[1].textContent = city.time.slice(0, 5);
      label.setAttribute("aria-label", `Показать город ${city.name}`);
      label.addEventListener("click", () => onSelect(city.id));
      this.labelLayer.append(label);
      this.markers.push({ city, position, dot, ring, label });
    }

    let pointerStart = { x: 0, y: 0 };
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    });
    this.renderer.domElement.addEventListener("pointerup", (event) => {
      if (
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) > 5
      )
        return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = this.raycaster.intersectObjects(
        this.markers.map((marker) => marker.dot),
      )[0];
      const surface = this.raycaster.intersectObject(this.earth)[0];
      if (hit && (!surface || hit.distance < surface.distance))
        onSelect(hit.object.userData.cityID as string);
    });
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.host.dispatchEvent(
        new CustomEvent("globe-error", {
          detail: "Графический контекст потерян. Перезапустите приложение.",
        }),
      );
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.select(this.selectedID, false);
    this.resize();
    this.animate();
  }

  async loadTextures(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const [day, night, clouds] = await Promise.all([
      loader.loadAsync("/textures/earth-day-8k.png"),
      loader.loadAsync("/textures/earth-night-8k.jpg"),
      loader.loadAsync("/textures/earth-clouds-8k.jpg"),
    ]);
    for (const texture of [day, night, clouds]) {
      texture.colorSpace =
        texture === clouds ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
    }
    this.earthMaterial.uniforms.dayMap.value.dispose();
    this.earthMaterial.uniforms.dayMap.value = day;
    this.earthMaterial.uniforms.nightMap.value = night;
    this.clouds.material.alphaMap = clouds;
    this.clouds.material.needsUpdate = true;
    this.clouds.visible = true;
  }

  update(cities: CityTime[]): void {
    const byID = new Map(cities.map((city) => [city.id, city]));
    for (const marker of this.markers) {
      const city = byID.get(marker.city.id);
      if (city) {
        marker.city = city;
        marker.label.children[1].textContent = city.time.slice(0, 5);
      }
    }
  }

  setSunlight(enabled: boolean, date: Date): void {
    const sun = new THREE.Vector3(...sunPosition(date));
    this.earthMaterial.uniforms.sunDirection.value.copy(sun);
    this.earthMaterial.uniforms.lightingEnabled.value = enabled ? 1 : 0;
    this.sunlight.position.copy(sun).multiplyScalar(5);
    this.sunlight.intensity = enabled ? 2 : 0;
    this.ambientLight.intensity = enabled ? 0.08 : 1.2;
  }

  select(id: string, move = true): void {
    this.selectedID = id;
    for (const marker of this.markers) {
      const selected = marker.city.id === id;
      marker.label.classList.toggle("selected", selected);
      marker.label.setAttribute("aria-pressed", String(selected));
      marker.dot.material.color.set(selected ? 0xffcf8a : 0x87efdf);
      marker.ring.material.color.copy(marker.dot.material.color);
      marker.dot.scale.setScalar(selected ? 1.5 : 1);
      if (selected && move) this.focus(marker.city.lat, marker.city.lon);
    }
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
    this.onRotateChange(enabled);
  }

  setLabels(visible: boolean): void {
    this.labelsVisible = visible;
  }

  reset(): void {
    this.focus(25, 25);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.animationClock.getDelta();
    if (active) this.animate();
    else cancelAnimationFrame(this.frame);
  }

  dispose(): void {
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.earthMaterial.uniforms.dayMap.value.dispose();
    this.earthMaterial.uniforms.nightMap.value.dispose();
    this.clouds.material.alphaMap?.dispose();
    this.renderer.dispose();
    this.labelLayer.remove();
    this.renderer.domElement.remove();
  }

  private focus(lat: number, lon: number): void {
    this.setAutoRotate(false);
    this.controls.enabled = false;
    const direction = this.camera.position.clone().normalize();
    this.focusAnimation = {
      start: performance.now(),
      direction,
      rotation: new THREE.Quaternion().setFromUnitVectors(
        direction,
        new THREE.Vector3(...toXYZ(lat, lon)),
      ),
      distance: this.camera.position.length(),
    };
  }

  private resize(): void {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    if (!this.width || !this.height) return;
    this.camera.aspect = this.width / this.height;
    // Leave space for the title and selected clock without moving the Earth's origin.
    this.camera.setViewOffset(
      this.width,
      this.height,
      this.width > 650 ? -this.width * 0.07 : 0,
      -this.height * 0.025,
      this.width,
      this.height,
    );
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  private addStars(): void {
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const positions: number[] = [];
    for (let i = 0; i < 1100; i++) {
      const z = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const radius = 30;
      positions.push(
        radius * Math.sqrt(1 - z * z) * Math.cos(theta),
        radius * z,
        radius * Math.sqrt(1 - z * z) * Math.sin(theta),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0x93afc3,
          size: 0.035,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
  }

  private animate = (): void => {
    if (!this.active) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.animationClock.getDelta(), 0.05);
    if (this.focusAnimation) {
      const animation = this.focusAnimation;
      const progress = this.reducedMotion
        ? 1
        : Math.min((performance.now() - animation.start) / 1100, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const rotation = new THREE.Quaternion().slerp(animation.rotation, eased);
      this.camera.position
        .copy(animation.direction)
        .applyQuaternion(rotation)
        .multiplyScalar(THREE.MathUtils.lerp(animation.distance, 4.2, eased));
      this.camera.lookAt(0, 0, 0);
      if (progress === 1) {
        this.focusAnimation = undefined;
        this.controls.enabled = true;
      }
    }
    this.controls.update(delta);
    if (!this.reducedMotion) this.clouds.rotation.y += delta * 0.003;
    this.renderer.render(this.scene, this.camera);
    this.positionLabels();
    const pulse = this.reducedMotion
      ? 1
      : 1 + Math.sin(performance.now() / 600) * 0.18;
    for (const marker of this.markers)
      marker.ring.scale.setScalar(
        marker.city.id === this.selectedID ? pulse * 1.4 : 1,
      );
  };

  private positionLabels(): void {
    const occupied: { x: number; y: number }[] = [];
    const ordered = [...this.markers].sort(
      (a, b) =>
        Number(b.city.id === this.selectedID) -
        Number(a.city.id === this.selectedID),
    );
    for (const marker of ordered) {
      this.towardCamera.copy(this.camera.position).sub(marker.position);
      const front = marker.position.dot(this.towardCamera) > 0.08;
      this.screen.copy(marker.position).project(this.camera);
      const x = (this.screen.x * 0.5 + 0.5) * this.width + 12;
      const y = (-this.screen.y * 0.5 + 0.5) * this.height - 42;
      const overlapsTitle = x < 400 && y < 210;
      const overlapsClock = x < 250 && y > this.height - 340;
      const visible =
        this.labelsVisible &&
        front &&
        this.screen.z < 1 &&
        x > 0 &&
        x < this.width - 128 &&
        y > 85 &&
        y < this.height - 100 &&
        !overlapsTitle &&
        !overlapsClock &&
        !occupied.some(
          (rect) => Math.abs(rect.x - x) < 136 && Math.abs(rect.y - y) < 54,
        );
      marker.label.hidden = !visible;
      if (visible) {
        marker.label.style.transform = `translate(${x}px, ${y}px)`;
        occupied.push({ x, y });
      }
    }
  }
}
