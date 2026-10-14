// A mat4 is 16 floats, stored column by column. That is the order WebGL sends to GLSL.
// Index 0 is column 0 row 0. Translation sits in the last column: indices 12, 13, and 14.

// Multiplies every axis by s. A scale of 1 leaves the cube the same size.
export function scaleMatrix(s)
{
    return new Float32Array([
        s, 0, 0, 0,
        0, s, 0, 0,
        0, 0, s, 0,
        0, 0, 0, 1
    ]);
}

// Turns the cube around its vertical axis. cos and sin take radians, not degrees.
export function rotationYMatrix(radians)
{
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    return new Float32Array([
         c, 0, -s, 0,
         0, 1,  0, 0,
         s, 0,  c, 0,
         0, 0,  0, 1
    ]);
}

// Moves the cube by x, y, z. This column only affects a point whose w is 1.
export function translationMatrix(x, y, z)
{
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1
    ]);
}

// Returns a * b. Applied to a vertex, b happens first and a happens second.
export function multiplyMatrices(a, b)
{
    const out = new Float32Array(16);

    for (let column = 0; column < 4; column++)
    {
        for (let row = 0; row < 4; row++)
        {
            out[column * 4 + row] =
                a[0 * 4 + row] * b[column * 4 + 0] +
                a[1 * 4 + row] * b[column * 4 + 1] +
                a[2 * 4 + row] * b[column * 4 + 2] +
                a[3 * 4 + row] * b[column * 4 + 3];
        }
    }

    return out;
}
