import { lookAt, multiplyMatrices, perspectiveMatrix, rotationXMatrix, rotationYMatrix, rotationZMatrix, scaleMatrix, translationMatrix } from "./mat4.js";
import { copyMaterial, materialPresets, sameMaterial } from "./materials.js";
import { createCubeMesh, createPlatformMesh, createRockMesh, createSphereMesh } from "./geometry.js";
import { fitMesh, parseObj } from "./obj.js";
import { createProgram } from "./webgl.js";

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

let lightX = 0.4;
let lightY = 1;
let lightZ = 0.25;
let ambient = 0.22;
let diffuseIntensity = 0.8;
let specularIntensity = 1;

// 0 face colours, 1 normal colours, 2 diffuse lighting, 3 diffuse plus specular.
let displayMode = 3;

let program = null;
let uModelLocation = null;
let uViewLocation = null;
let uProjectionLocation = null;
let uDisplayModeLocation = null;
let uLightDirectionLocation = null;
let uCameraPositionLocation = null;
let uBaseColorLocation = null;
let uShininessLocation = null;
let uSpecularStrengthLocation = null;
let uAmbientLocation = null;
let uDiffuseIntensityLocation = null;
let uSpecularIntensityLocation = null;

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
const lightXInput = document.getElementById("lightX");
const lightYInput = document.getElementById("lightY");
const lightZInput = document.getElementById("lightZ");
const ambientInput = document.getElementById("ambient");
const diffuseIntensityInput = document.getElementById("diffuseIntensity");
const specularIntensityInput = document.getElementById("specularIntensity");
const lightXValue = document.getElementById("lightXValue");
const lightYValue = document.getElementById("lightYValue");
const lightZValue = document.getElementById("lightZValue");
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
    }

    lightXValue.textContent = lightX.toFixed(2);
    lightYValue.textContent = lightY.toFixed(2);
    lightZValue.textContent = lightZ.toFixed(2);
    ambientValue.textContent = ambient.toFixed(2);
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

    if (object)
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

function render()
{
    if (!program || !gpuReady)
    {
        return;
    }

    gl.useProgram(program);

    // The camera and the light are shared. Only the model matrix and material change per object.
    gl.uniformMatrix4fv(uViewLocation, false, viewMatrix());
    gl.uniformMatrix4fv(uProjectionLocation, false, projectionMatrix());
    gl.uniform1i(uDisplayModeLocation, displayMode);
    gl.uniform3f(uLightDirectionLocation, lightX, lightY, lightZ);
    gl.uniform3f(uCameraPositionLocation, cameraX, cameraY, cameraZ);
    gl.uniform1f(uAmbientLocation, ambient);
    gl.uniform1f(uDiffuseIntensityLocation, diffuseIntensity);
    gl.uniform1f(uSpecularIntensityLocation, specularIntensity);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    scene.forEach((object) =>
    {
        const mesh = gpuMeshes.get(object.meshId);
        const material = object.material;

        gl.uniformMatrix4fv(uModelLocation, false, objectModelMatrix(object));
        gl.uniform3f(uBaseColorLocation, material.baseColor[0], material.baseColor[1], material.baseColor[2]);
        gl.uniform1f(uShininessLocation, material.shininess);
        gl.uniform1f(uSpecularStrengthLocation, material.specularStrength);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
    });
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

    const stride = 9 * Float32Array.BYTES_PER_ELEMENT;
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const colorLocation = gl.getAttribLocation(program, "aColor");
    const normalLocation = gl.getAttribLocation(program, "aNormal");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(normalLocation);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gpuMeshes.set(id, {
        vao: vao,
        indexCount: data.indices.length,
        indexType: data.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
    });
}

async function loadShaderSource(url)
{
    const response = await fetch(url);

    if (!response.ok)
    {
        throw new Error("Could not load " + url + ". Open this page from a local server.");
    }

    return response.text();
}

function selectDisplay(mode)
{
    displayMode = mode;
    showFacesButton.classList.toggle("is-selected", mode === 0);
    showNormalsButton.classList.toggle("is-selected", mode === 1);
    showDiffuseButton.classList.toggle("is-selected", mode === 2);
    showSpecularButton.classList.toggle("is-selected", mode === 3);
    showFacesButton.setAttribute("aria-pressed", String(mode === 0));
    showNormalsButton.setAttribute("aria-pressed", String(mode === 1));
    showDiffuseButton.setAttribute("aria-pressed", String(mode === 2));
    showSpecularButton.setAttribute("aria-pressed", String(mode === 3));
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

buildDefaultScene();
selectedId = scene[1].id;

async function main()
{
    const vertexSource = await loadShaderSource("shaders/cube-vertex.glsl");
    const fragmentSource = await loadShaderSource("shaders/cube-fragment.glsl");
    program = createProgram(gl, vertexSource, fragmentSource);

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
    uDisplayModeLocation = gl.getUniformLocation(program, "uDisplayMode");
    uLightDirectionLocation = gl.getUniformLocation(program, "uLightDirection");
    uCameraPositionLocation = gl.getUniformLocation(program, "uCameraPosition");
    uBaseColorLocation = gl.getUniformLocation(program, "uBaseColor");
    uShininessLocation = gl.getUniformLocation(program, "uShininess");
    uSpecularStrengthLocation = gl.getUniformLocation(program, "uSpecularStrength");
    uAmbientLocation = gl.getUniformLocation(program, "uAmbient");
    uDiffuseIntensityLocation = gl.getUniformLocation(program, "uDiffuseIntensity");
    uSpecularIntensityLocation = gl.getUniformLocation(program, "uSpecularIntensity");
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
                    halfHeight: fit.halfHeight
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

    function onLightInput()
    {
        lightX = Number(lightXInput.value);
        lightY = Number(lightYInput.value);
        lightZ = Number(lightZInput.value);
        ambient = Number(ambientInput.value);
        diffuseIntensity = Number(diffuseIntensityInput.value);
        specularIntensity = Number(specularIntensityInput.value);
        updateReadouts();
        render();
    }

    [lightXInput, lightYInput, lightZInput, ambientInput, diffuseIntensityInput, specularIntensityInput]
        .forEach((input) => input.addEventListener("input", onLightInput));

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
