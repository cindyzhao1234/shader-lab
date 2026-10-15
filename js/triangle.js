import { createProgram } from "./webgl.js";

const canvas = document.getElementById("glCanvas");
const status = document.getElementById("status");
const gl = canvas.getContext("webgl2");

if (!gl)
{
    status.textContent = "WebGL2 is not available in this browser.";
    throw new Error("WebGL2 is not supported");
}

// Three corners of one triangle, in clip space.
// The first number of each pair is x. The second is y.
const vertices = new Float32Array([
     0.0,  0.5,
    -0.5, -0.5,
     0.5, -0.5
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

async function main()
{
    const vertexSource = await loadShaderSource("shaders/triangle-vertex.glsl");
    const fragmentSource = await loadShaderSource("shaders/triangle-fragment.glsl");
    const program = createProgram(gl, vertexSource, fragmentSource);

    const positionBuffer = gl.createBuffer();

    // ARRAY_BUFFER is where the draw will read vertex data from.
    // bufferData copies the three positions into GPU memory.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "aPosition");

    // The attribute is off until enabled. Each vertex is two floats: x, then y.
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(program);
    gl.clearColor(0.07, 0.07, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // The vertex shader runs once per corner. Rasterisation fills the pixels between them.
    // The fragment shader then colours each of those pixels.
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

main().catch((error) =>
{
    console.error(error);
    status.textContent = error.message;
});
