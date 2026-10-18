import * as THREE from "three";
import { createCheckerTexture, createRippleNormalTexture } from "../render/textures";

/**
 * The default scene, carried over from the original phase-5 demo so the app is
 * never empty on first run: a platform with a textured cube, a normal-mapped
 * sphere, two rocks and a pebble, lit by a sun, a warm point light and a cool
 * spotlight.
 *
 * The composition is the same; the shading is not. Phong presets become
 * physically-based roughness and metalness so these objects respond to image
 * based lighting the same way an imported Blender model will.
 */

type PresetName = "matte" | "plastic" | "glossy" | "ceramic";

const PRESETS: Record<PresetName, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.95, metalness: 0 },
  plastic: { roughness: 0.42, metalness: 0 },
  glossy: { roughness: 0.14, metalness: 0.25 },
  ceramic: { roughness: 0.3, metalness: 0.02 },
};

function material(preset: PresetName, rgb: [number, number, number]): THREE.MeshStandardMaterial {
  const colour = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  return new THREE.MeshStandardMaterial({ color: colour, ...PRESETS[preset] });
}

/**
 * A sphere pushed in and out along its own normals, then re-normalled so the
 * lumps actually catch the light. The displacement matches the original
 * `createRockMesh` so the two scenes are recognisably the same.
 */
function createRockGeometry(radius = 0.5, widthSegments = 14, heightSegments = 10): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const point = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).normalize();
    const bump = 0.16 * Math.sin(point.x * 9 + point.y * 4) * Math.cos(point.z * 7 + 1.7);
    point.multiplyScalar(radius * (1 + bump));
    position.setXYZ(index, point.x, point.y, point.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export interface DemoScene {
  root: THREE.Group;
  /** Every object a user can select, in hierarchy order. */
  objects: THREE.Mesh[];
  lights: THREE.Light[];
}

export function createDemoScene(): DemoScene {
  const root = new THREE.Group();
  root.name = "Demo Scene";

  const checker = createCheckerTexture(6);
  const rippleNormal = createRippleNormalTexture();

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.16, 3.6),
    material("matte", [0.42, 0.44, 0.4]),
  );
  platform.name = "Platform";
  platform.position.set(0, -0.08, 0);
  platform.receiveShadow = true;

  const cubeMaterial = material("plastic", [0.2, 0.45, 0.86]);
  cubeMaterial.map = checker;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), cubeMaterial);
  cube.name = "Cube";
  cube.position.set(0.75, 0.35, 0.15);
  cube.rotation.y = THREE.MathUtils.degToRad(20);

  const sphereMaterial = material("ceramic", [0.86, 0.84, 0.78]);
  sphereMaterial.normalMap = rippleNormal;
  sphereMaterial.normalScale.set(0.6, 0.6);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 32), sphereMaterial);
  sphere.name = "Sphere";
  sphere.position.set(-0.7, 0.4, 0.25);

  const rockGeometry = createRockGeometry();

  const rockOne = new THREE.Mesh(rockGeometry, material("matte", [0.35, 0.28, 0.22]));
  rockOne.name = "Rock 1";
  rockOne.position.set(-1.35, 0.25, 0.85);
  rockOne.rotation.y = THREE.MathUtils.degToRad(18);
  rockOne.scale.setScalar(0.5);

  const rockTwo = new THREE.Mesh(rockGeometry, material("matte", [0.5, 0.38, 0.28]));
  rockTwo.name = "Rock 2";
  rockTwo.position.set(1.45, 0.19, 0.55);
  rockTwo.rotation.y = THREE.MathUtils.degToRad(-25);
  rockTwo.scale.setScalar(0.38);

  const pebble = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 32, 24),
    material("glossy", [0.25, 0.28, 0.32]),
  );
  pebble.name = "Pebble";
  pebble.position.set(0.05, 0.14, 1.05);

  const objects = [platform, cube, sphere, rockOne, rockTwo, pebble];

  for (const object of objects) {
    object.castShadow = object !== platform;
    object.receiveShadow = true;
    root.add(object);
  }

  const lights = createDemoLights();

  for (const light of lights) {
    root.add(light);

    if (light instanceof THREE.SpotLight) {
      root.add(light.target);
    }
  }

  return { root, objects, lights };
}

function createDemoLights(): THREE.Light[] {
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.1);
  sun.name = "Sun";
  sun.position.set(0.45, 1, 0.2).normalize().multiplyScalar(8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;

  // Fitted to the demo scene's footprint. Stage 2 replaces this with a
  // frustum derived from the actual scene bounds, which the original
  // hardcoded ±5 box could not do.
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -3;
  shadowCamera.right = 3;
  shadowCamera.top = 3;
  shadowCamera.bottom = -3;
  shadowCamera.near = 0.5;
  shadowCamera.far = 20;
  shadowCamera.updateProjectionMatrix();

  const warmPoint = new THREE.PointLight(0xff7a2a, 7, 5, 2);
  warmPoint.name = "Warm Point";
  warmPoint.position.set(-1.45, 0.55, 0.9);

  const coolSpot = new THREE.SpotLight(
    0x6aa8ff,
    26,
    9,
    THREE.MathUtils.degToRad(30),
    0.6,
    2,
  );
  coolSpot.name = "Cool Spot";
  coolSpot.position.set(0.9, 2.3, 1.6);
  coolSpot.target.position.set(
    coolSpot.position.x - 0.15 * 2,
    coolSpot.position.y - 0.85 * 2,
    coolSpot.position.z - 0.55 * 2,
  );

  return [sun, warmPoint, coolSpot];
}
