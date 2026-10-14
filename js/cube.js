import { multiplyMatrices, rotationYMatrix, scaleMatrix, translationMatrix } from "./mat4.js";
import { createProgram } from "./webgl.js";

const canvas = document.getElementById("glCanvas");
const status = document.getElementById("status");

// depth: true asks for a depth buffer, which depth testing writes into.
const gl = canvas.getContext("webgl2", { depth: true });

if (!gl)
{
    status.textContent = "WebGL2 is not available in this browser.";
    throw new Error("WebGL2 is not supported");
}

// Each corner is model space: the cube's own x, y, and z, before the sliders move it.
// The red face is z = -0.5. A modest Y rotation keeps that face toward the viewer.
// A face has its own four corners so that face can be one solid colour.
// A single stored vertex can only carry one colour, and each cube corner belongs to three faces.
// x, y, z, r, g, b
const vertices = new Float32Array([
    // Near face, z = -0.5. Red.
    -0.5, -0.5, -0.5,  0.85, 0.25, 0.22,
     0.5, -0.5, -0.5,  0.85, 0.25, 0.22,
     0.5,  0.5, -0.5,  0.85, 0.25, 0.22,
    -0.5,  0.5, -0.5,  0.85, 0.25, 0.22,

    // Far face, z = 0.5. Blue.
     0.5, -0.5,  0.5,  0.25, 0.45, 0.90,
    -0.5, -0.5,  0.5,  0.25, 0.45, 0.90,
    -0.5,  0.5,  0.5,  0.25, 0.45, 0.90,
     0.5,  0.5,  0.5,  0.25, 0.45, 0.90,

    // Top, y = 0.5. Green.
    -0.5,  0.5, -0.5,  0.30, 0.75, 0.40,
     0.5,  0.5, -0.5,  0.30, 0.75, 0.40,
     0.5,  0.5,  0.5,  0.30, 0.75, 0.40,
    -0.5,  0.5,  0.5,  0.30, 0.75, 0.40,

    // Bottom, y = -0.5. Yellow.
    -0.5, -0.5,  0.5,  0.90, 0.80, 0.30,
     0.5, -0.5,  0.5,  0.90, 0.80, 0.30,
     0.5, -0.5, -0.5,  0.90, 0.80, 0.30,
    -0.5, -0.5, -0.5,  0.90, 0.80, 0.30,

    // Right, x = 0.5. Orange.
     0.5, -0.5, -0.5,  0.95, 0.55, 0.20,
     0.5, -0.5,  0.5,  0.95, 0.55, 0.20,
     0.5,  0.5,  0.5,  0.95, 0.55, 0.20,
     0.5,  0.5, -0.5,  0.95, 0.55, 0.20,

    // Left, x = -0.5. Cyan.
    -0.5, -0.5,  0.5,  0.30, 0.75, 0.85,
    -0.5, -0.5, -0.5,  0.30, 0.75, 0.85,
    -0.5,  0.5, -0.5,  0.30, 0.75, 0.85,
    -0.5,  0.5,  0.5,  0.30, 0.75, 0.85
]);

// Each face is two triangles. The numbers are positions in the vertex list, not coordinates.
// Near face, vertices 0, 1, 2, 3:
//   0, 1, 2 is the first triangle
//   0, 2, 3 is the second triangle
const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,
     4,  5,  6,   4,  6,  7,
     8,  9, 10,   8, 10, 11,
    12, 13, 14,  12, 14, 15,
    16, 17, 18,  16, 18, 19,
    20, 21, 22,  20, 22, 23
]);

async function loadShaderSource(url)
{
    const response = await fetch(url);

    if (!response.ok)
    {
        throw new Error(
            "Could not load " + url + ". Open this page from a local server, such as VS Code Live Server."
        );
    }

    return response.text();
}

const positionXInput = document.getElementById("positionX");
const rotationYInput = document.getElementById("rotationY");
const scaleInput = document.getElementById("scale");
const positionXValue = document.getElementById("positionXValue");
const rotationYValue = document.getElementById("rotationYValue");
const scaleValue = document.getElementById("scaleValue");

let positionX = 0;
let rotationYDegrees = 35;
let uniformScale = 1;
let program = null;
let uModelLocation = null;

function updateSliderLabels()
{
    positionXValue.textContent = positionX.toFixed(2);
    rotationYValue.textContent = rotationYDegrees.toFixed(0) + "°";
    scaleValue.textContent = uniformScale.toFixed(2);
}

// Scale, then rotate, then translate. Matrix multiplication applies from the right.
function modelMatrix()
{
    const scale = scaleMatrix(uniformScale);
    const rotation = rotationYMatrix(rotationYDegrees * Math.PI / 180);
    const translation = translationMatrix(positionX, 0, 0);

    return multiplyMatrices(translation, multiplyMatrices(rotation, scale));
}

function render()
{
    gl.useProgram(program);

    // false tells WebGL the array is already column-major, so it must not be transposed.
    gl.uniformMatrix4fv(uModelLocation, false, modelMatrix());

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // drawElements walks the index list and reuses corners instead of copying them.
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

async function main()
{
    const vertexSource = await loadShaderSource("shaders/cube-vertex.glsl");
    const fragmentSource = await loadShaderSource("shaders/cube-fragment.glsl");
    program = createProgram(gl, vertexSource, fragmentSource);

    const positionBuffer = gl.createBuffer();

    // The vertex buffer stores the corner positions and colours.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const colorLocation = gl.getAttribLocation(program, "aColor");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

    const indexBuffer = gl.createBuffer();

    // The index buffer stores which vertices form each triangle.
    // ELEMENT_ARRAY_BUFFER is the slot drawElements reads those indices from.
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Without the depth test, a later triangle can paint over a nearer one.
    gl.enable(gl.DEPTH_TEST);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.07, 0.07, 0.08, 1);

    // The uniform location is how JavaScript finds uModel inside the linked program.
    uModelLocation = gl.getUniformLocation(program, "uModel");

    positionXInput.addEventListener("input", () =>
    {
        positionX = Number(positionXInput.value);
        updateSliderLabels();
        render();
    });

    rotationYInput.addEventListener("input", () =>
    {
        rotationYDegrees = Number(rotationYInput.value);
        updateSliderLabels();
        render();
    });

    scaleInput.addEventListener("input", () =>
    {
        uniformScale = Number(scaleInput.value);
        updateSliderLabels();
        render();
    });

    render();
}

main().catch((error) =>
{
    console.error(error);
    status.textContent = error.message;
});
