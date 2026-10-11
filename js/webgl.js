import { createTexture } from "./texture.js";

// GPU side of the app. render() copies the JavaScript state below into uniforms.
// The fragment shader then does the actual colour work.

let gl = null;
let program = null;
let texture = null;
let sourceImage = null;

let brightness = 0;
let contrast = 1;
let saturation = 1;
let colorLevels = 32;
let edgeThreshold = 0.15;
let outlineThickness = 1;

let textureLocation = null;
let brightnessLocation = null;
let contrastLocation = null;
let saturationLocation = null;
let colorLevelsLocation = null;
let edgeThresholdLocation = null;
let outlineThicknessLocation = null;
let fitScaleLocation = null;

// Turns GLSL text into a shader object the program can link.
export function createShader(gl, type, source)
{
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Compilation fails when the GLSL has a syntax error. The driver log says where.
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        const log = gl.getShaderInfoLog(shader);
        const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";

        console.error(kind + " shader compile error:\n" + log);
        gl.deleteShader(shader);
        throw new Error(kind + " shader compile error:\n" + log);
    }

    return shader;
}

// A program is the vertex shader and fragment shader linked as one draw operation.
export function createProgram(gl, vertexSource, fragmentSource)
{
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    // Linking fails when the two shaders disagree, for example an out/in name mismatch.
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    {
        const log = gl.getProgramInfoLog(program);

        console.error("Program link error:\n" + log);
        gl.deleteProgram(program);
        throw new Error("Program link error:\n" + log);
    }

    // After a successful link, the program keeps the compiled code.
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
}

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

function setupRectangle()
{
    // Two triangles make one rectangle. Each corner stores a position and a texture coordinate.
    const vertices = new Float32Array([
        -1, -1, 0, 0,
         1, -1, 1, 0,
        -1,  1, 0, 1,

        -1,  1, 0, 1,
         1, -1, 1, 0,
         1,  1, 1, 1
    ]);

    const positionBuffer = gl.createBuffer();

    // ARRAY_BUFFER is the slot vertex data is read from during a draw.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const texCoordLocation = gl.getAttribLocation(program, "aTexCoord");
    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;

    // The attribute is off until enabled. The pointer describes one vec2 inside each record.
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    textureLocation = gl.getUniformLocation(program, "uTexture");
    brightnessLocation = gl.getUniformLocation(program, "uBrightness");
    contrastLocation = gl.getUniformLocation(program, "uContrast");
    saturationLocation = gl.getUniformLocation(program, "uSaturation");
    colorLevelsLocation = gl.getUniformLocation(program, "uColorLevels");
    edgeThresholdLocation = gl.getUniformLocation(program, "uEdgeThreshold");
    outlineThicknessLocation = gl.getUniformLocation(program, "uOutlineThickness");
    fitScaleLocation = gl.getUniformLocation(program, "uFitScale");
}

// Clip space always spans -1 to 1, even when the canvas is not square.
// Shrink the axis that would otherwise stretch the photo.
function fitScale(imageWidth, imageHeight, canvasWidth, canvasHeight)
{
    const imageAspect = imageWidth / imageHeight;
    const canvasAspect = canvasWidth / canvasHeight;

    if (imageAspect > canvasAspect)
    {
        return [1, canvasAspect / imageAspect];
    }

    return [imageAspect / canvasAspect, 1];
}

// The drawing buffer is the pixel grid WebGL renders into.
// It is separate from the canvas CSS size, so we match it here or the preview looks blurry.
function resizeCanvas()
{
    const canvas = gl.canvas;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

    if (canvas.width !== width || canvas.height !== height)
    {
        canvas.width = width;
        canvas.height = height;
    }

    // The browser may give a slightly smaller buffer than requested.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    render();
}

export function setBrightness(value)
{
    brightness = value;
}

export function setContrast(value)
{
    contrast = value;
}

export function setSaturation(value)
{
    saturation = value;
}

export function setColorLevels(value)
{
    colorLevels = value;
}

export function setEdgeThreshold(value)
{
    edgeThreshold = value;
}

export function setOutlineThickness(value)
{
    outlineThickness = value;
}

export function resetAdjustments()
{
    brightness = 0;
    contrast = 1;
    saturation = 1;
    colorLevels = 32;
    edgeThreshold = 0.15;
    outlineThickness = 1;
}

// Keeps the image size for aspect-ratio fitting, and uploads a new GPU texture.
export function setImage(image)
{
    sourceImage = image;

    if (texture)
    {
        gl.deleteTexture(texture);
    }

    texture = createTexture(gl, image);
}

// Draws one frame from the texture and slider values already stored above.
// Nothing is animating, so we redraw only when a slider, the image, or the size changes.
export function render()
{
    gl.clearColor(0.07, 0.07, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!texture || !program)
    {
        return;
    }

    gl.useProgram(program);

    const scale = fitScale(
        sourceImage.width,
        sourceImage.height,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight
    );

    // The sampler uniform is the texture unit number, not the texture object.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(textureLocation, 0);

    gl.uniform1f(brightnessLocation, brightness);
    gl.uniform1f(contrastLocation, contrast);
    gl.uniform1f(saturationLocation, saturation);
    gl.uniform1f(colorLevelsLocation, colorLevels);
    gl.uniform1f(edgeThresholdLocation, edgeThreshold);
    gl.uniform1f(outlineThicknessLocation, outlineThickness);
    gl.uniform2f(fitScaleLocation, scale[0], scale[1]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export async function initWebGL(canvas)
{
    gl = canvas.getContext("webgl2");

    if (!gl)
    {
        const error = new Error("WebGL2 is not supported");
        error.userMessage = "WebGL2 is not available in this browser.";
        throw error;
    }

    const vertexSource = await loadShaderSource("shaders/vertex.glsl");
    const fragmentSource = await loadShaderSource("shaders/fragment.glsl");

    program = createProgram(gl, vertexSource, fragmentSource);
    setupRectangle();

    new ResizeObserver(resizeCanvas).observe(canvas);
    resizeCanvas();
}
