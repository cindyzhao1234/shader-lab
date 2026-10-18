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

// Turns around the X axis. cos and sin take radians, not degrees.
export function rotationXMatrix(radians)
{
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    return new Float32Array([
        1, 0, 0, 0,
        0, c, s, 0,
        0, -s, c, 0,
        0, 0, 0, 1
    ]);
}

// Turns around the vertical axis. cos and sin take radians, not degrees.
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

// Turns around the Z axis. cos and sin take radians, not degrees.
export function rotationZMatrix(radians)
{
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    return new Float32Array([
        c, s, 0, 0,
        -s, c, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}

// Moves a point by x, y, z. This column only affects a point whose w is 1.
export function translationMatrix(x, y, z)
{
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1
    ]);
}

function subtract(a, b)
{
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b)
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b)
{
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function normalize(v)
{
    const length = Math.hypot(v[0], v[1], v[2]);

    if (length === 0)
    {
        return [0, 0, 0];
    }

    return [v[0] / length, v[1] / length, v[2] / length];
}

// eye is where the camera sits. target is the point it looks at. up is which way is up.
// The result is the inverse of the camera's own placement: it moves the world so the
// camera ends up at the origin, looking down the negative Z axis.
export function lookAt(eye, target, up)
{
    let forward = subtract(eye, target);

    // The camera cannot sit on the target, because that leaves it with no direction.
    if (dot(forward, forward) < 0.000001)
    {
        forward = [0, 0, 1];
    }

    const zAxis = normalize(forward);
    let xAxis = cross(up, zAxis);

    // up must not point along the view. If it does, pick another temporary up.
    if (dot(xAxis, xAxis) < 0.000001)
    {
        xAxis = cross([0, 0, 1], zAxis);
    }

    xAxis = normalize(xAxis);
    const yAxis = normalize(cross(zAxis, xAxis));

    return new Float32Array([
        xAxis[0], yAxis[0], zAxis[0], 0,
        xAxis[1], yAxis[1], zAxis[1], 0,
        xAxis[2], yAxis[2], zAxis[2], 0,
        -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1
    ]);
}

// Perspective turns view space into clip space.
// The view frustum is the pyramid of space the camera can see.
// fovRadians is the vertical opening of that pyramid.
// aspect is canvas width / height, so a wide canvas gets a wider opening.
// near and far are the front and back of the pyramid. Outside them, WebGL clips the triangle.
// The -1 in the last row writes -viewZ into gl_Position.w.
// WebGL then divides xyz by w. Farther vertices shrink. That is the perspective divide.
export function perspectiveMatrix(fovRadians, aspect, near, far)
{
    const f = 1 / Math.tan(fovRadians / 2);
    const range = near - far;

    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / range, -1,
        0, 0, (2 * far * near) / range, 0
    ]);
}

// Inverse-transpose of the model matrix's 3×3.
// A uniform scale can use the model matrix itself. A non-uniform scale would tilt a plain
// mat3 normal, so this keeps the normal perpendicular to the scaled surface.
export function normalMatrix(model)
{
    const a = model[0];
    const b = model[1];
    const c = model[2];
    const d = model[4];
    const e = model[5];
    const f = model[6];
    const g = model[8];
    const h = model[9];
    const i = model[10];

    const c00 = e * i - f * h;
    const c01 = c * h - b * i;
    const c02 = b * f - c * e;
    const c10 = f * g - d * i;
    const c11 = a * i - c * g;
    const c12 = c * d - a * f;
    const c20 = d * h - e * g;
    const c21 = b * g - a * h;
    const c22 = a * e - b * d;
    const det = a * c00 + d * c01 + g * c02;

    if (Math.abs(det) < 0.0000001)
    {
        return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    }

    const inv = 1 / det;

    return new Float32Array([
        c00 * inv, c10 * inv, c20 * inv,
        c01 * inv, c11 * inv, c21 * inv,
        c02 * inv, c12 * inv, c22 * inv
    ]);
}

// An orthographic box. Directional shadow maps use this instead of a perspective lens.
export function orthoMatrix(left, right, bottom, top, near, far)
{
    const rl = right - left;
    const tb = top - bottom;
    const fn = far - near;

    return new Float32Array([
        2 / rl, 0, 0, 0,
        0, 2 / tb, 0, 0,
        0, 0, -2 / fn, 0,
        -(right + left) / rl, -(top + bottom) / tb, -(far + near) / fn, 1
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
