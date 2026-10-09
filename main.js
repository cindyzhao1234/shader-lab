const canvas = document.getElementById("glCanvas");

const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL2 is not supported");
}

gl.clearColor(0.1, 0.1, 0.1, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);