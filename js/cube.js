import { lookAt, multiplyMatrices, normalMatrix, orthoMatrix, perspectiveMatrix, rotationXMatrix, rotationYMatrix, rotationZMatrix, scaleMatrix, translationMatrix } from "./mat4.js";
import { copyMaterial, materialPresets, sameMaterial } from "./materials.js";
import { createCubeMesh, createPlatformMesh, createRockMesh, createSphereMesh, FLOATS_PER_VERTEX } from "./geometry.js";
import { fitMesh, parseObj } from "./obj.js";
import { createProgram } from "./webgl.js";
import { defaultLights, MAX_LIGHTS, createPointLight } from "./lights.js";
import { createShadowTarget, resizeShadowTarget } from "./shadowmap.js";
import { configureTexture, createCheckerTexture, createDemoNormalTexture, createSolidTexture, loadImage, uploadImageTexture } from "./texture.js";

const canvas = document.getElementById("glCanvas");
const status = document.getElementById("status");

const gl = canvas.getContext("webgl2", { depth: true });

if (!gl)
{
    status.textContent = "WebGL2 is not available in this browser.";
    throw new Error("WebGL2 is not supported");
}

// Mesh data is the shape. A scene object only points at a mesh id.
const meshData = new Map([
    ["platform", createPlatformMesh()],
    ["cube", createCubeMesh()],
    ["sphere", createSphereMesh()],
    ["rock", createRockMesh()]
]);

const gpuMeshes = new Map();

const nearPlane = 0.1;
const farPlane = 100;
const defaultEye = [4.2, 2.6, 5.2];
const defaultTarget = [0, 0.35, 0];
const defaultFov = 50;

let nextObjectId = 1;
let nextImportId = 1;
const scene = [];
let selectedId = null;
let gpuReady = false;

let cameraX = defaultEye[0];
let cameraY = defaultEye[1];
let cameraZ = defaultEye[2];
let targetX = defaultTarget[0];
let targetY = defaultTarget[1];
let targetZ = defaultTarget[2];
let fovDegrees = defaultFov;
let orbitYaw = 0;
let orbitPitch = 0;
let orbitDistance = 1;

let lights = defaultLights();
let selectedLightIndex = 0;
let shadowsEnabled = true;
let shadowResolution = 1024;
let shadowBias = 0.002;
let shadowSoftness = 1;
let shadowTarget = null;
let lightViewProjection = new Float32Array(16);
let shadowLightIndex = 0;
let checkerTexture = null;
let demoNormalTexture = null;
let whiteTexture = null;
let flatNormalTexture = null;
let ambient = 0.22;
let diffuseIntensity = 0.8;
let specularIntensity = 1;

// 0 face colours, 1 normal colours, 2 diffuse lighting, 3 diffuse plus specular.
let displayMode = 3;

let program = null;
let depthProgram = null;
let uModelLocation = null;
let uViewLocation = null;
let uProjectionLocation = null;
let uNormalMatrixLocation = null;
let uDisplayModeLocation = null;
let uCameraPositionLocation = null;
let uBaseColorLocation = null;
let uShininessLocation = null;
let uSpecularStrengthLocation = null;
let uAmbientLocation = null;
let uDiffuseIntensityLocation = null;
let uSpecularIntensityLocation = null;
let uUvTileLocation = null;
let uUseTextureLocation = null;
let uUseNormalMapLocation = null;
let uNormalStrengthLocation = null;
let uMeshHasUvsLocation = null;
let uLightCountLocation = null;
let uLightEnabledLocation = null;
let uLightTypeLocation = null;
let uLightColorLocation = null;
let uLightDirectionLocation = null;
let uLightPositionLocation = null;
let uLightIntensityLocation = null;
let uLightRangeLocation = null;
let uLightInnerCosLocation = null;
let uLightOuterCosLocation = null;
let uShadowsEnabledLocation = null;
let uShadowLightIndexLocation = null;
let uShadowBiasLocation = null;
let uShadowSoftnessLocation = null;
let uLightViewProjectionLocation = null;
let uDepthModelLocation = null;
let uDepthLightViewProjectionLocation = null;

const sceneList = document.getElementById("sceneList");
const objectProperties = document.getElementById("objectProperties");
const noSelection = document.getElementById("noSelection");
const objectNameInput = document.getElementById("objectName");
const deleteObjectButton = document.getElementById("deleteObject");
const positionXInput = document.getElementById("positionX");
const positionYInput = document.getElementById("positionY");
const positionZInput = document.getElementById("positionZ");
const rotationXInput = document.getElementById("rotationX");
const rotationYInput = document.getElementById("rotationY");
const rotationZInput = document.getElementById("rotationZ");
const scaleInput = document.getElementById("scale");
const positionXValue = document.getElementById("positionXValue");
const positionYValue = document.getElementById("positionYValue");
const positionZValue = document.getElementById("positionZValue");
const rotationXValue = document.getElementById("rotationXValue");
const rotationYValue = document.getElementById("rotationYValue");
const rotationZValue = document.getElementById("rotationZValue");
const scaleValue = document.getElementById("scaleValue");
const materialState = document.getElementById("materialState");
const baseColorInput = document.getElementById("baseColor");
const baseColorValue = document.getElementById("baseColorValue");
const shininessInput = document.getElementById("shininess");
const shininessValue = document.getElementById("shininessValue");
const specularStrengthInput = document.getElementById("specularStrength");
const specularStrengthValue = document.getElementById("specularStrengthValue");
const presetButtons = {
    matte: document.getElementById("materialMatte"),
    plastic: document.getElementById("materialPlastic"),
    glossy: document.getElementById("materialGlossy"),
    ceramic: document.getElementById("materialCeramic")
};
const showFacesButton = document.getElementById("showFaces");
const showNormalsButton = document.getElementById("showNormals");
const showDiffuseButton = document.getElementById("showDiffuse");
const showSpecularButton = document.getElementById("showSpecular");
const showUvButton = document.getElementById("showUv");
const showLightingNormalsButton = document.getElementById("showLightingNormals");
const showSpecularOnlyButton = document.getElementById("showSpecularOnly");
const showShadowButton = document.getElementById("showShadow");
const displayButtons = [
    showFacesButton,
    showNormalsButton,
    showDiffuseButton,
    showSpecularButton,
    showUvButton,
    showLightingNormalsButton,
    showSpecularOnlyButton,
    showShadowButton
];
const useTextureInput = document.getElementById("useTexture");
const albedoFileInput = document.getElementById("albedoFile");
const textureWrapInput = document.getElementById("textureWrap");
const textureFilterInput = document.getElementById("textureFilter");
const tileUInput = document.getElementById("tileU");
const tileVInput = document.getElementById("tileV");
const tileUValue = document.getElementById("tileUValue");
const tileVValue = document.getElementById("tileVValue");
const uvWarning = document.getElementById("uvWarning");
const useNormalMapInput = document.getElementById("useNormalMap");
const normalFileInput = document.getElementById("normalFile");
const normalStrengthInput = document.getElementById("normalStrength");
const normalStrengthValue = document.getElementById("normalStrengthValue");
const lightList = document.getElementById("lightList");
const addLightButton = document.getElementById("addLight");
const removeLightButton = document.getElementById("removeLight");
const lightEnabledInput = document.getElementById("lightEnabled");
const lightTypeInput = document.getElementById("lightType");
const lightColorInput = document.getElementById("lightColor");
const lightColorValue = document.getElementById("lightColorValue");
const lightIntensityInput = document.getElementById("lightIntensity");
const lightIntensityValue = document.getElementById("lightIntensityValue");
const directionFields = document.getElementById("directionFields");
const positionFields = document.getElementById("positionFields");
const spotFields = document.getElementById("spotFields");
const directionLabel = document.getElementById("directionLabel");
const dirXInput = document.getElementById("dirX");
const dirYInput = document.getElementById("dirY");
const dirZInput = document.getElementById("dirZ");
const dirXValue = document.getElementById("dirXValue");
const dirYValue = document.getElementById("dirYValue");
const dirZValue = document.getElementById("dirZValue");
const lightPosXInput = document.getElementById("lightPosX");
const lightPosYInput = document.getElementById("lightPosY");
const lightPosZInput = document.getElementById("lightPosZ");
const lightRangeInput = document.getElementById("lightRange");
const lightPosXValue = document.getElementById("lightPosXValue");
const lightPosYValue = document.getElementById("lightPosYValue");
const lightPosZValue = document.getElementById("lightPosZValue");
const lightRangeValue = document.getElementById("lightRangeValue");
const innerAngleInput = document.getElementById("innerAngle");
const outerAngleInput = document.getElementById("outerAngle");
const innerAngleValue = document.getElementById("innerAngleValue");
const outerAngleValue = document.getElementById("outerAngleValue");
const shadowsEnabledInput = document.getElementById("shadowsEnabled");
const shadowResolutionInput = document.getElementById("shadowResolution");
const shadowBiasInput = document.getElementById("shadowBias");
const shadowSoftnessInput = document.getElementById("shadowSoftness");
const shadowBiasValue = document.getElementById("shadowBiasValue");
const shadowSoftnessValue = document.getElementById("shadowSoftnessValue");
const resetDemoButton = document.getElementById("resetDemo");
const ambientInput = document.getElementById("ambient");
const diffuseIntensityInput = document.getElementById("diffuseIntensity");
const specularIntensityInput = document.getElementById("specularIntensity");
const ambientValue = document.getElementById("ambientValue");
const diffuseValue = document.getElementById("diffuseValue");
const specularIntensityValue = document.getElementById("specularIntensityValue");
const cameraXInput = document.getElementById("cameraX");
const cameraYInput = document.getElementById("cameraY");
const cameraZInput = document.getElementById("cameraZ");
const fovInput = document.getElementById("fov");
const cameraXValue = document.getElementById("cameraXValue");
const cameraYValue = document.getElementById("cameraYValue");
const cameraZValue = document.getElementById("cameraZValue");
const fovValue = document.getElementById("fovValue");
const resetCameraButton = document.getElementById("resetCamera");
const addCubeButton = document.getElementById("addCube");
const addSphereButton = document.getElementById("addSphere");
const importInput = document.getElementById("importObj");

function tinted(presetName, color)
{
    const material = copyMaterial(materialPresets[presetName]);
    material.baseColor = color.slice();
    return material;
}

function addSceneObject(name, meshId, position, rotation, scale, material)
{
    const object = {
        id: nextObjectId,
        name: name,
        meshId: meshId,
        position: position.slice(),
        rotation: rotation.slice(),
        scale: scale,
        material: material
    };

    nextObjectId += 1;
    scene.push(object);
    return object;
}

function uniqueName(base)
{
    const names = new Set(scene.map((object) => object.name));

    if (!names.has(base))
    {
        return base;
    }

    let index = 2;

    while (names.has(base + " " + index))
    {
        index += 1;
    }

    return base + " " + index;
}

// Rock 1 and Rock 2 share the rock mesh. Sphere and Pebble share the sphere mesh.
function buildDefaultScene()
{
    const platform = meshData.get("platform");
    const cube = meshData.get("cube");
    const sphere = meshData.get("sphere");
    const rock = meshData.get("rock");

    addSceneObject("Platform", "platform", [0, -platform.halfHeight, 0], [0, 0, 0], 1, tinted("matte", [0.42, 0.44, 0.40]));
    addSceneObject("Cube", "cube", [0.75, cube.halfHeight * 0.7, 0.15], [0, 20, 0], 0.7, copyMaterial(materialPresets.plastic));
    addSceneObject("Sphere", "sphere", [-0.7, sphere.halfHeight * 0.8, 0.25], [0, 0, 0], 0.8, copyMaterial(materialPresets.ceramic));
    addSceneObject("Rock 1", "rock", [-1.35, rock.halfHeight * 0.5, 0.85], [0, 18, 0], 0.5, tinted("matte", [0.35, 0.28, 0.22]));
    addSceneObject("Rock 2", "rock", [1.45, rock.halfHeight * 0.38, 0.55], [0, -25, 0], 0.38, tinted("matte", [0.5, 0.38, 0.28]));
    addSceneObject("Pebble", "sphere", [0.05, sphere.halfHeight * 0.28, 1.05], [0, 0, 0], 0.28, tinted("glossy", [0.25, 0.28, 0.32]));
}

function selectedObject()
{
    return scene.find((object) => object.id === selectedId) || null;
}

function colorByte(value)
{
    return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function rgbToHex(color)
{
    return "#" + color.map((channel) => colorByte(channel).toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex)
{
    const value = Number.parseInt(hex.slice(1), 16);

    return [
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255
    ];
}

function updateReadouts()
{
    const object = selectedObject();

    if (object)
    {
        positionXValue.textContent = object.position[0].toFixed(2);
        positionYValue.textContent = object.position[1].toFixed(2);
        positionZValue.textContent = object.position[2].toFixed(2);
        rotationXValue.textContent = object.rotation[0].toFixed(0) + "°";
        rotationYValue.textContent = object.rotation[1].toFixed(0) + "°";
        rotationZValue.textContent = object.rotation[2].toFixed(0) + "°";
        scaleValue.textContent = object.scale.toFixed(2);
        baseColorValue.textContent = rgbToHex(object.material.baseColor);
        shininessValue.textContent = object.material.shininess.toFixed(0);
        specularStrengthValue.textContent = object.material.specularStrength.toFixed(2);
        tileUValue.textContent = object.material.tileU.toFixed(2);
        tileVValue.textContent = object.material.tileV.toFixed(2);
        normalStrengthValue.textContent = object.material.normalStrength.toFixed(2);
    }

    const light = selectedLight();

    if (light)
    {
        lightColorValue.textContent = rgbToHex(light.color);
        lightIntensityValue.textContent = light.intensity.toFixed(2);
        dirXValue.textContent = light.direction[0].toFixed(2);
        dirYValue.textContent = light.direction[1].toFixed(2);
        dirZValue.textContent = light.direction[2].toFixed(2);
        lightPosXValue.textContent = light.position[0].toFixed(2);
        lightPosYValue.textContent = light.position[1].toFixed(2);
        lightPosZValue.textContent = light.position[2].toFixed(2);
        lightRangeValue.textContent = light.range.toFixed(2);
        innerAngleValue.textContent = light.innerAngle.toFixed(0) + "°";
        outerAngleValue.textContent = light.outerAngle.toFixed(0) + "°";
    }

    ambientValue.textContent = ambient.toFixed(2);
    shadowBiasValue.textContent = shadowBias.toFixed(4);
    shadowSoftnessValue.textContent = String(shadowSoftness);
    diffuseValue.textContent = diffuseIntensity.toFixed(2);
    specularIntensityValue.textContent = specularIntensity.toFixed(2);
    cameraXValue.textContent = cameraX.toFixed(2);
    cameraYValue.textContent = cameraY.toFixed(2);
    cameraZValue.textContent = cameraZ.toFixed(2);
    fovValue.textContent = fovDegrees.toFixed(0) + "°";
}

function refreshMaterialSelection()
{
    const object = selectedObject();
    let matched = null;

    if (object && !object.material.useTexture && !object.material.useNormalMap)
    {
        Object.keys(materialPresets).forEach((key) =>
        {
            if (sameMaterial(object.material, materialPresets[key]))
            {
                matched = key;
            }
        });
    }

    Object.keys(presetButtons).forEach((key) =>
    {
        const selected = key === matched;
        presetButtons[key].classList.toggle("is-selected", selected);
        presetButtons[key].setAttribute("aria-pressed", String(selected));
    });

    materialState.textContent = matched ? materialPresets[matched].name : "Custom";
}

function syncObjectControls()
{
    const object = selectedObject();
    objectProperties.hidden = !object;
    noSelection.hidden = !!object;

    if (!object)
    {
        return;
    }

    objectNameInput.value = object.name;
    positionXInput.value = String(object.position[0]);
    positionYInput.value = String(object.position[1]);
    positionZInput.value = String(object.position[2]);
    rotationXInput.value = String(object.rotation[0]);
    rotationYInput.value = String(object.rotation[1]);
    rotationZInput.value = String(object.rotation[2]);
    scaleInput.value = String(object.scale);
    baseColorInput.value = rgbToHex(object.material.baseColor);
    shininessInput.value = String(object.material.shininess);
    specularStrengthInput.value = String(object.material.specularStrength);
    useTextureInput.checked = object.material.useTexture;
    textureWrapInput.value = object.material.wrapRepeat ? "repeat" : "clamp";
    textureFilterInput.value = object.material.filterLinear ? "linear" : "nearest";
    tileUInput.value = String(object.material.tileU);
    tileVInput.value = String(object.material.tileV);
    useNormalMapInput.checked = object.material.useNormalMap;
    normalStrengthInput.value = String(object.material.normalStrength);

    const mesh = meshData.get(object.meshId);
    const hasUvs = !mesh || mesh.hasUvs !== false;
    uvWarning.hidden = hasUvs || (!object.material.useTexture && !object.material.useNormalMap);

    updateReadouts();
    refreshMaterialSelection();
}

function renderSceneList()
{
    sceneList.replaceChildren();

    scene.forEach((object) =>
    {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "▸ " + object.name;
        button.classList.toggle("is-selected", object.id === selectedId);

        if (object.id === selectedId)
        {
            button.setAttribute("aria-current", "true");
        }
        button.addEventListener("click", () =>
        {
            selectObject(object.id);
        });
        sceneList.appendChild(button);
    });
}

function selectObject(id)
{
    selectedId = id;
    renderSceneList();
    syncObjectControls();
}

function degrees(value)
{
    return value * Math.PI / 180;
}

// Scale, then rotate X, Y, Z, then translate. Each object gets its own matrix.
function objectModelMatrix(object)
{
    const scale = scaleMatrix(object.scale);
    const rotationX = rotationXMatrix(degrees(object.rotation[0]));
    const rotationY = rotationYMatrix(degrees(object.rotation[1]));
    const rotationZ = rotationZMatrix(degrees(object.rotation[2]));
    const translation = translationMatrix(object.position[0], object.position[1], object.position[2]);
    const rotation = multiplyMatrices(rotationZ, multiplyMatrices(rotationY, rotationX));

    return multiplyMatrices(translation, multiplyMatrices(rotation, scale));
}

function viewMatrix()
{
    return lookAt([cameraX, cameraY, cameraZ], [targetX, targetY, targetZ], [0, 1, 0]);
}

function projectionMatrix()
{
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;

    return perspectiveMatrix(degrees(fovDegrees), aspect, nearPlane, farPlane);
}

function selectedLight()
{
    return lights[selectedLightIndex] || null;
}

function lightTypeValue(type)
{
    if (type === "point")
    {
        return 1;
    }

    if (type === "spot")
    {
        return 2;
    }

    return 0;
}

function cosineDegrees(angle)
{
    return Math.cos(degrees(angle));
}

function updateShadowMatrix()
{
    shadowLightIndex = -1;

    for (let index = 0; index < lights.length; index++)
    {
        if (lights[index].enabled && lights[index].type === "directional")
        {
            shadowLightIndex = index;
            break;
        }
    }

    if (shadowLightIndex < 0)
    {
        return;
    }

    const direction = lights[shadowLightIndex].direction;
    const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    const eye = [
        direction[0] / length * 8,
        direction[1] / length * 8,
        direction[2] / length * 8
    ];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const projection = orthoMatrix(-5, 5, -5, 5, 0.5, 16);
    lightViewProjection = multiplyMatrices(projection, view);
}

function uploadLightUniforms()
{
    const count = Math.min(lights.length, MAX_LIGHTS);
    const enabled = new Int32Array(MAX_LIGHTS);
    const types = new Int32Array(MAX_LIGHTS);
    const colors = new Float32Array(MAX_LIGHTS * 3);
    const directions = new Float32Array(MAX_LIGHTS * 3);
    const positions = new Float32Array(MAX_LIGHTS * 3);
    const intensities = new Float32Array(MAX_LIGHTS);
    const ranges = new Float32Array(MAX_LIGHTS);
    const innerCos = new Float32Array(MAX_LIGHTS);
    const outerCos = new Float32Array(MAX_LIGHTS);

    for (let index = 0; index < count; index++)
    {
        const light = lights[index];
        let inner = light.innerAngle;
        let outer = Math.max(light.outerAngle, inner + 1);
        enabled[index] = light.enabled ? 1 : 0;
        types[index] = lightTypeValue(light.type);
        colors.set(light.color, index * 3);
        directions.set(light.direction, index * 3);
        positions.set(light.position, index * 3);
        intensities[index] = light.intensity;
        ranges[index] = light.range;
        innerCos[index] = cosineDegrees(inner);
        outerCos[index] = cosineDegrees(outer);
    }

    gl.uniform1i(uLightCountLocation, count);
    gl.uniform1iv(uLightEnabledLocation, enabled);
    gl.uniform1iv(uLightTypeLocation, types);
    gl.uniform3fv(uLightColorLocation, colors);
    gl.uniform3fv(uLightDirectionLocation, directions);
    gl.uniform3fv(uLightPositionLocation, positions);
    gl.uniform1fv(uLightIntensityLocation, intensities);
    gl.uniform1fv(uLightRangeLocation, ranges);
    gl.uniform1fv(uLightInnerCosLocation, innerCos);
    gl.uniform1fv(uLightOuterCosLocation, outerCos);
}

function bindMaterialTextures(object, mesh)
{
    const material = object.material;
    const hasUvs = mesh.hasUvs !== false;
    const useTexture = material.useTexture && material.albedo && hasUvs;
    const useNormal = material.useNormalMap && material.normalMap && hasUvs;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, useTexture ? material.albedo : whiteTexture);

    if (useTexture)
    {
        configureTexture(gl, material.albedo, material.wrapRepeat, material.filterLinear);
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, useNormal ? material.normalMap : flatNormalTexture);

    if (useNormal)
    {
        configureTexture(gl, material.normalMap, material.wrapRepeat, material.filterLinear);
    }

    gl.uniform1i(uUseTextureLocation, useTexture ? 1 : 0);
    gl.uniform1i(uUseNormalMapLocation, useNormal ? 1 : 0);
    gl.uniform1i(uMeshHasUvsLocation, hasUvs ? 1 : 0);
    gl.uniform2f(uUvTileLocation, material.tileU, material.tileV);
    gl.uniform1f(uNormalStrengthLocation, material.normalStrength);
}

function drawSceneObjects(modelLocation)
{
    scene.forEach((object) =>
    {
        const mesh = gpuMeshes.get(object.meshId);
        gl.uniformMatrix4fv(modelLocation, false, objectModelMatrix(object));
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
    });

    gl.bindVertexArray(null);
}

function renderShadowMap()
{
    updateShadowMatrix();

    if (!shadowsEnabled || shadowLightIndex < 0 || !shadowTarget)
    {
        return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget.framebuffer);
    gl.viewport(0, 0, shadowTarget.size, shadowTarget.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(depthProgram);
    gl.uniformMatrix4fv(uDepthLightViewProjectionLocation, false, lightViewProjection);

    // Front faces hide the back faces that would otherwise poke through the lit surface.
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 2);
    drawSceneObjects(uDepthModelLocation);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function render()
{
    if (!program || !gpuReady)
    {
        return;
    }

    renderShadowMap();

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uViewLocation, false, viewMatrix());
    gl.uniformMatrix4fv(uProjectionLocation, false, projectionMatrix());
    gl.uniform1i(uDisplayModeLocation, displayMode);
    gl.uniform3f(uCameraPositionLocation, cameraX, cameraY, cameraZ);
    gl.uniform1f(uAmbientLocation, ambient);
    gl.uniform1f(uDiffuseIntensityLocation, diffuseIntensity);
    gl.uniform1f(uSpecularIntensityLocation, specularIntensity);
    gl.uniform1i(uShadowsEnabledLocation, shadowsEnabled && shadowLightIndex >= 0 ? 1 : 0);
    gl.uniform1i(uShadowLightIndexLocation, Math.max(0, shadowLightIndex));
    gl.uniform1f(uShadowBiasLocation, shadowBias);
    gl.uniform1i(uShadowSoftnessLocation, shadowSoftness);
    gl.uniformMatrix4fv(uLightViewProjectionLocation, false, lightViewProjection);
    uploadLightUniforms();

    gl.activeTexture(gl.TEXTURE2);

    if (shadowTarget)
    {
        gl.bindTexture(gl.TEXTURE_2D, shadowTarget.texture);
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    scene.forEach((object) =>
    {
        const mesh = gpuMeshes.get(object.meshId);
        const material = object.material;
        const model = objectModelMatrix(object);

        gl.uniformMatrix4fv(uModelLocation, false, model);
        gl.uniformMatrix3fv(uNormalMatrixLocation, false, normalMatrix(model));
        gl.uniform3f(uBaseColorLocation, material.baseColor[0], material.baseColor[1], material.baseColor[2]);
        gl.uniform1f(uShininessLocation, material.shininess);
        gl.uniform1f(uSpecularStrengthLocation, material.specularStrength);
        bindMaterialTextures(object, mesh);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
    });

    gl.bindVertexArray(null);
}

function syncOrbitFromEye()
{
    const dx = cameraX - targetX;
    const dy = cameraY - targetY;
    const dz = cameraZ - targetZ;

    orbitDistance = Math.max(0.3, Math.hypot(dx, dy, dz));
    orbitPitch = Math.asin(Math.max(-1, Math.min(1, dy / orbitDistance)));
    orbitYaw = Math.atan2(dx, dz);
}

function applyOrbit()
{
    const cosine = Math.cos(orbitPitch);

    cameraX = targetX + orbitDistance * cosine * Math.sin(orbitYaw);
    cameraY = targetY + orbitDistance * Math.sin(orbitPitch);
    cameraZ = targetZ + orbitDistance * cosine * Math.cos(orbitYaw);
    cameraXInput.value = String(cameraX);
    cameraYInput.value = String(cameraY);
    cameraZInput.value = String(cameraZ);
    updateReadouts();
}

function writeCameraInputs()
{
    cameraXInput.value = String(cameraX);
    cameraYInput.value = String(cameraY);
    cameraZInput.value = String(cameraZ);
    fovInput.value = String(fovDegrees);
}

function resetCamera()
{
    cameraX = defaultEye[0];
    cameraY = defaultEye[1];
    cameraZ = defaultEye[2];
    targetX = defaultTarget[0];
    targetY = defaultTarget[1];
    targetZ = defaultTarget[2];
    fovDegrees = defaultFov;
    writeCameraInputs();
    syncOrbitFromEye();
    updateReadouts();
    render();
}

function readTransform()
{
    const object = selectedObject();

    if (!object)
    {
        return;
    }

    object.position[0] = Number(positionXInput.value);
    object.position[1] = Number(positionYInput.value);
    object.position[2] = Number(positionZInput.value);
    object.rotation[0] = Number(rotationXInput.value);
    object.rotation[1] = Number(rotationYInput.value);
    object.rotation[2] = Number(rotationZInput.value);
    object.scale = Number(scaleInput.value);
    updateReadouts();
    render();
}

function uploadMesh(id)
{
    const data = meshData.get(id);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);

    const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;

    // Locations match layout(location) in the shader, so the depth pass can share this VAO.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 9 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 11 * Float32Array.BYTES_PER_ELEMENT);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gpuMeshes.set(id, {
        vao: vao,
        indexCount: data.indices.length,
        indexType: data.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        hasUvs: data.hasUvs !== false
    });
}

async function loadShaderSource(url)
{
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok)
    {
        throw new Error("Could not load " + url + ". Open this page from a local server.");
    }

    return response.text();
}

function selectDisplay(mode)
{
    displayMode = mode;

    displayButtons.forEach((button, index) =>
    {
        const selected = index === mode;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

    render();
}

function addPrimitive(meshId, baseName)
{
    const mesh = meshData.get(meshId);
    const scale = meshId === "cube" ? 0.7 : 0.6;
    const object = addSceneObject(
        uniqueName(baseName),
        meshId,
        [((scene.length % 4) - 1.5) * 0.45, mesh.halfHeight * scale, 0.9],
        [0, 0, 0],
        scale,
        copyMaterial(materialPresets.plastic)
    );

    selectObject(object.id);
    render();
}

function applyDemoTextures()
{
    scene.forEach((object) =>
    {
        if (object.name === "Cube")
        {
            object.material.useTexture = true;
            object.material.albedo = checkerTexture;
            object.material.wrapRepeat = true;
            object.material.tileU = 2;
            object.material.tileV = 2;
        }

        if (object.name === "Sphere")
        {
            object.material.useNormalMap = true;
            object.material.normalMap = demoNormalTexture;
        }
    });
}

function resetDemo()
{
    scene.length = 0;
    nextObjectId = 1;
    lights = defaultLights();
    selectedLightIndex = 0;
    shadowsEnabled = true;
    shadowResolution = 1024;
    shadowBias = 0.002;
    shadowSoftness = 1;
    displayMode = 3;
    shadowsEnabledInput.checked = true;
    shadowResolutionInput.value = "1024";
    shadowBiasInput.value = "0.002";
    shadowSoftnessInput.value = "1";
    buildDefaultScene();
    applyDemoTextures();
    selectedId = scene[1].id;

    if (shadowTarget)
    {
        shadowTarget = resizeShadowTarget(gl, shadowTarget, shadowResolution);
    }

    resetCamera();
    renderSceneList();
    renderLightList();
    syncLightControls();
    syncObjectControls();
    selectDisplay(3);
    status.textContent = "";
}

function renderLightList()
{
    lightList.replaceChildren();

    lights.forEach((light, index) =>
    {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = (light.enabled ? "▸ " : "○ ") + light.name;
        button.classList.toggle("is-selected", index === selectedLightIndex);

        if (index === selectedLightIndex)
        {
            button.setAttribute("aria-current", "true");
        }

        button.addEventListener("click", () =>
        {
            selectedLightIndex = index;
            renderLightList();
            syncLightControls();
        });
        lightList.appendChild(button);
    });
}

function syncLightControls()
{
    const light = selectedLight();

    if (!light)
    {
        return;
    }

    lightEnabledInput.checked = light.enabled;
    lightTypeInput.value = light.type;
    lightColorInput.value = rgbToHex(light.color);
    lightIntensityInput.value = String(light.intensity);
    dirXInput.value = String(light.direction[0]);
    dirYInput.value = String(light.direction[1]);
    dirZInput.value = String(light.direction[2]);
    lightPosXInput.value = String(light.position[0]);
    lightPosYInput.value = String(light.position[1]);
    lightPosZInput.value = String(light.position[2]);
    lightRangeInput.value = String(light.range);
    innerAngleInput.value = String(light.innerAngle);
    outerAngleInput.value = String(light.outerAngle);
    directionFields.hidden = light.type === "point";
    positionFields.hidden = light.type === "directional";
    spotFields.hidden = light.type !== "spot";
    directionLabel.textContent = light.type === "spot" ? "Aim X" : "Direction X";
    updateReadouts();
}

buildDefaultScene();
selectedId = scene[1].id;

async function main()
{
    const vertexSource = await loadShaderSource("shaders/cube-vertex.glsl");
    const fragmentSource = await loadShaderSource("shaders/cube-fragment.glsl");
    const depthVertexSource = await loadShaderSource("shaders/depth-vertex.glsl");
    const depthFragmentSource = await loadShaderSource("shaders/depth-fragment.glsl");
    program = createProgram(gl, vertexSource, fragmentSource);
    depthProgram = createProgram(gl, depthVertexSource, depthFragmentSource);

    meshData.forEach((data, id) =>
    {
        uploadMesh(id);
    });

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0.07, 0.07, 0.08, 1);

    uModelLocation = gl.getUniformLocation(program, "uModel");
    uViewLocation = gl.getUniformLocation(program, "uView");
    uProjectionLocation = gl.getUniformLocation(program, "uProjection");
    uNormalMatrixLocation = gl.getUniformLocation(program, "uNormalMatrix");
    uDisplayModeLocation = gl.getUniformLocation(program, "uDisplayMode");
    uCameraPositionLocation = gl.getUniformLocation(program, "uCameraPosition");
    uBaseColorLocation = gl.getUniformLocation(program, "uBaseColor");
    uShininessLocation = gl.getUniformLocation(program, "uShininess");
    uSpecularStrengthLocation = gl.getUniformLocation(program, "uSpecularStrength");
    uAmbientLocation = gl.getUniformLocation(program, "uAmbient");
    uDiffuseIntensityLocation = gl.getUniformLocation(program, "uDiffuseIntensity");
    uSpecularIntensityLocation = gl.getUniformLocation(program, "uSpecularIntensity");
    uUvTileLocation = gl.getUniformLocation(program, "uUvTile");
    uUseTextureLocation = gl.getUniformLocation(program, "uUseTexture");
    uUseNormalMapLocation = gl.getUniformLocation(program, "uUseNormalMap");
    uNormalStrengthLocation = gl.getUniformLocation(program, "uNormalStrength");
    uMeshHasUvsLocation = gl.getUniformLocation(program, "uMeshHasUvs");
    uLightCountLocation = gl.getUniformLocation(program, "uLightCount");
    uLightEnabledLocation = gl.getUniformLocation(program, "uLightEnabled");
    uLightTypeLocation = gl.getUniformLocation(program, "uLightType");
    uLightColorLocation = gl.getUniformLocation(program, "uLightColor");
    uLightDirectionLocation = gl.getUniformLocation(program, "uLightDirection");
    uLightPositionLocation = gl.getUniformLocation(program, "uLightPosition");
    uLightIntensityLocation = gl.getUniformLocation(program, "uLightIntensity");
    uLightRangeLocation = gl.getUniformLocation(program, "uLightRange");
    uLightInnerCosLocation = gl.getUniformLocation(program, "uLightInnerCos");
    uLightOuterCosLocation = gl.getUniformLocation(program, "uLightOuterCos");
    uShadowsEnabledLocation = gl.getUniformLocation(program, "uShadowsEnabled");
    uShadowLightIndexLocation = gl.getUniformLocation(program, "uShadowLightIndex");
    uShadowBiasLocation = gl.getUniformLocation(program, "uShadowBias");
    uShadowSoftnessLocation = gl.getUniformLocation(program, "uShadowSoftness");
    uLightViewProjectionLocation = gl.getUniformLocation(program, "uLightViewProjection");
    uDepthModelLocation = gl.getUniformLocation(depthProgram, "uModel");
    uDepthLightViewProjectionLocation = gl.getUniformLocation(depthProgram, "uLightViewProjection");

    whiteTexture = createSolidTexture(gl, 255, 255, 255, 255);
    flatNormalTexture = createSolidTexture(gl, 128, 128, 255, 255);
    checkerTexture = createCheckerTexture(gl);
    demoNormalTexture = createDemoNormalTexture(gl);
    shadowTarget = createShadowTarget(gl, shadowResolution);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "uAlbedoMap"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uNormalMap"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "uShadowMap"), 2);
    applyDemoTextures();
    renderLightList();
    syncLightControls();
    syncObjectControls();
    gpuReady = true;

    function resizeCanvas()
    {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

        if (canvas.width !== width || canvas.height !== height)
        {
            canvas.width = width;
            canvas.height = height;
        }

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        render();
    }

    [positionXInput, positionYInput, positionZInput, rotationXInput, rotationYInput, rotationZInput, scaleInput]
        .forEach((input) => input.addEventListener("input", readTransform));

    objectNameInput.addEventListener("input", () =>
    {
        const object = selectedObject();

        if (!object)
        {
            return;
        }

        object.name = objectNameInput.value || "Object";
        renderSceneList();
    });

    deleteObjectButton.addEventListener("click", () =>
    {
        const index = scene.findIndex((object) => object.id === selectedId);

        if (index < 0)
        {
            return;
        }

        scene.splice(index, 1);
        const next = scene[index] || scene[index - 1] || null;
        selectObject(next ? next.id : null);
        render();
    });

    addCubeButton.addEventListener("click", () => addPrimitive("cube", "Cube"));
    addSphereButton.addEventListener("click", () => addPrimitive("sphere", "Sphere"));

    importInput.addEventListener("change", () =>
    {
        const file = importInput.files && importInput.files[0];
        importInput.value = "";

        if (!file)
        {
            return;
        }

        const reader = new FileReader();

        reader.onload = () =>
        {
            try
            {
                const parsed = parseObj(String(reader.result));
                const fit = fitMesh(parsed.vertices, 1);
                const meshId = "import-" + nextImportId;
                nextImportId += 1;
                meshData.set(meshId, {
                    vertices: parsed.vertices,
                    indices: parsed.indices,
                    halfHeight: fit.halfHeight,
                    hasUvs: parsed.hasUvs
                });
                uploadMesh(meshId);

                const name = file.name.replace(/\.obj$/i, "") || "Model";
                const object = addSceneObject(
                    uniqueName(name),
                    meshId,
                    [0, fit.halfHeight, 0.2],
                    [0, 0, 0],
                    1,
                    copyMaterial(materialPresets.ceramic)
                );

                status.textContent = "";
                selectObject(object.id);
                render();
            }
            catch (error)
            {
                status.textContent = error.message;
            }
        };

        reader.onerror = () =>
        {
            status.textContent = "Could not read that file.";
        };

        reader.readAsText(file);
    });

    Object.keys(presetButtons).forEach((key) =>
    {
        presetButtons[key].addEventListener("click", () =>
        {
            const object = selectedObject();

            if (!object)
            {
                return;
            }

            object.material = copyMaterial(materialPresets[key]);
            syncObjectControls();
            render();
        });
    });

    baseColorInput.addEventListener("input", () =>
    {
        const object = selectedObject();

        if (!object)
        {
            return;
        }

        object.material.baseColor = hexToRgb(baseColorInput.value);
        updateReadouts();
        refreshMaterialSelection();
        render();
    });

    shininessInput.addEventListener("input", () =>
    {
        const object = selectedObject();

        if (!object)
        {
            return;
        }

        object.material.shininess = Number(shininessInput.value);
        updateReadouts();
        refreshMaterialSelection();
        render();
    });

    specularStrengthInput.addEventListener("input", () =>
    {
        const object = selectedObject();

        if (!object)
        {
            return;
        }

        object.material.specularStrength = Number(specularStrengthInput.value);
        updateReadouts();
        refreshMaterialSelection();
        render();
    });

    showFacesButton.addEventListener("click", () => selectDisplay(0));
    showNormalsButton.addEventListener("click", () => selectDisplay(1));
    showDiffuseButton.addEventListener("click", () => selectDisplay(2));
    showSpecularButton.addEventListener("click", () => selectDisplay(3));
    showUvButton.addEventListener("click", () => selectDisplay(4));
    showLightingNormalsButton.addEventListener("click", () => selectDisplay(5));
    showSpecularOnlyButton.addEventListener("click", () => selectDisplay(6));
    showShadowButton.addEventListener("click", () => selectDisplay(7));

    function editMaterial(apply)
    {
        const object = selectedObject();

        if (!object)
        {
            return;
        }

        apply(object.material);
        updateReadouts();
        refreshMaterialSelection();
        syncObjectControls();
        render();
    }

    useTextureInput.addEventListener("change", () =>
    {
        editMaterial((material) =>
        {
            material.useTexture = useTextureInput.checked;
        });
    });

    textureWrapInput.addEventListener("change", () =>
    {
        editMaterial((material) =>
        {
            material.wrapRepeat = textureWrapInput.value === "repeat";
        });
    });

    textureFilterInput.addEventListener("change", () =>
    {
        editMaterial((material) =>
        {
            material.filterLinear = textureFilterInput.value === "linear";
        });
    });

    tileUInput.addEventListener("input", () =>
    {
        editMaterial((material) =>
        {
            material.tileU = Number(tileUInput.value);
        });
    });

    tileVInput.addEventListener("input", () =>
    {
        editMaterial((material) =>
        {
            material.tileV = Number(tileVInput.value);
        });
    });

    useNormalMapInput.addEventListener("change", () =>
    {
        editMaterial((material) =>
        {
            material.useNormalMap = useNormalMapInput.checked;
        });
    });

    normalStrengthInput.addEventListener("input", () =>
    {
        editMaterial((material) =>
        {
            material.normalStrength = Number(normalStrengthInput.value);
        });
    });

    function readImageFile(input, assign)
    {
        const file = input.files && input.files[0];
        input.value = "";

        if (!file)
        {
            return;
        }

        loadImage(file).then((image) =>
        {
            const object = selectedObject();

            if (!object)
            {
                return;
            }

            assign(object.material, uploadImageTexture(gl, image));
            syncObjectControls();
            render();
            status.textContent = "";
        }).catch(() =>
        {
            status.textContent = "Could not read that image.";
        });
    }

    albedoFileInput.addEventListener("change", () =>
    {
        readImageFile(albedoFileInput, (material, texture) =>
        {
            material.albedo = texture;
            material.useTexture = true;
        });
    });

    normalFileInput.addEventListener("change", () =>
    {
        readImageFile(normalFileInput, (material, texture) =>
        {
            material.normalMap = texture;
            material.useNormalMap = true;
        });
    });

    function onSceneLightInput()
    {
        ambient = Number(ambientInput.value);
        diffuseIntensity = Number(diffuseIntensityInput.value);
        specularIntensity = Number(specularIntensityInput.value);
        updateReadouts();
        render();
    }

    [ambientInput, diffuseIntensityInput, specularIntensityInput]
        .forEach((input) => input.addEventListener("input", onSceneLightInput));

    function readSelectedLight()
    {
        const light = selectedLight();

        if (!light)
        {
            return;
        }

        light.enabled = lightEnabledInput.checked;
        light.type = lightTypeInput.value;
        light.color = hexToRgb(lightColorInput.value);
        light.intensity = Number(lightIntensityInput.value);
        light.direction[0] = Number(dirXInput.value);
        light.direction[1] = Number(dirYInput.value);
        light.direction[2] = Number(dirZInput.value);
        light.position[0] = Number(lightPosXInput.value);
        light.position[1] = Number(lightPosYInput.value);
        light.position[2] = Number(lightPosZInput.value);
        light.range = Number(lightRangeInput.value);
        light.innerAngle = Number(innerAngleInput.value);
        light.outerAngle = Math.max(light.innerAngle + 1, Number(outerAngleInput.value));
        outerAngleInput.value = String(light.outerAngle);
        renderLightList();
        syncLightControls();
        render();
    }

    [
        lightEnabledInput,
        lightTypeInput,
        lightColorInput,
        lightIntensityInput,
        dirXInput,
        dirYInput,
        dirZInput,
        lightPosXInput,
        lightPosYInput,
        lightPosZInput,
        lightRangeInput,
        innerAngleInput,
        outerAngleInput
    ].forEach((input) => input.addEventListener("input", readSelectedLight));

    lightTypeInput.addEventListener("change", readSelectedLight);

    addLightButton.addEventListener("click", () =>
    {
        if (lights.length >= MAX_LIGHTS)
        {
            status.textContent = "This lesson uses at most " + MAX_LIGHTS + " lights.";
            return;
        }

        lights.push(createPointLight("Point " + (lights.length + 1), [0, 1.4, 0.6], [1, 1, 1], 1.5, 4));
        selectedLightIndex = lights.length - 1;
        status.textContent = "";
        renderLightList();
        syncLightControls();
        render();
    });

    removeLightButton.addEventListener("click", () =>
    {
        if (lights.length <= 1)
        {
            status.textContent = "The scene keeps at least one light.";
            return;
        }

        lights.splice(selectedLightIndex, 1);
        selectedLightIndex = Math.min(selectedLightIndex, lights.length - 1);
        status.textContent = "";
        renderLightList();
        syncLightControls();
        render();
    });

    function onShadowInput()
    {
        shadowsEnabled = shadowsEnabledInput.checked;
        const nextResolution = Number(shadowResolutionInput.value);

        if (nextResolution !== shadowResolution && shadowTarget)
        {
            shadowResolution = nextResolution;
            shadowTarget = resizeShadowTarget(gl, shadowTarget, shadowResolution);
        }

        shadowBias = Number(shadowBiasInput.value);
        shadowSoftness = Number(shadowSoftnessInput.value);
        updateReadouts();
        render();
    }

    [shadowsEnabledInput, shadowResolutionInput, shadowBiasInput, shadowSoftnessInput]
        .forEach((input) => input.addEventListener("input", onShadowInput));

    shadowResolutionInput.addEventListener("change", onShadowInput);

    resetDemoButton.addEventListener("click", resetDemo);

    function onCameraInput()
    {
        cameraX = Number(cameraXInput.value);
        cameraY = Number(cameraYInput.value);
        cameraZ = Number(cameraZInput.value);
        fovDegrees = Number(fovInput.value);
        syncOrbitFromEye();
        updateReadouts();
        render();
    }

    [cameraXInput, cameraYInput, cameraZInput, fovInput]
        .forEach((input) => input.addEventListener("input", onCameraInput));

    resetCameraButton.addEventListener("click", resetCamera);

    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    canvas.addEventListener("pointerdown", (event) =>
    {
        if (event.button !== 0)
        {
            return;
        }

        dragging = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) =>
    {
        if (!dragging)
        {
            return;
        }

        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        orbitYaw -= dx * 0.008;
        orbitPitch -= dy * 0.008;
        const limit = Math.PI / 2 - 0.05;
        orbitPitch = Math.max(-limit, Math.min(limit, orbitPitch));
        applyOrbit();
        render();
    });

    canvas.addEventListener("pointerup", () =>
    {
        dragging = false;
    });

    canvas.addEventListener("wheel", (event) =>
    {
        event.preventDefault();
        orbitDistance *= event.deltaY > 0 ? 1.08 : 0.92;
        orbitDistance = Math.max(0.8, Math.min(14, orbitDistance));
        applyOrbit();
        render();
    }, { passive: false });

    syncOrbitFromEye();
    selectDisplay(3);
    selectObject(selectedId);
    new ResizeObserver(resizeCanvas).observe(canvas);
    resizeCanvas();
}

main().catch((error) =>
{
    console.error(error);
    status.textContent = error.message;
});
