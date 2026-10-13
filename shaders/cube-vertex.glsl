#version 300 es

// x, y, and z for one corner of the cube.
in vec3 aPosition;

// The colour of the face this corner belongs to.
in vec3 aColor;

// Passed to the fragment shader. A face is one colour, so its pixels stay flat.
out vec3 vColor;

void main()
{
    vColor = aColor;

    // TEMPORARY until Phase 4.3.
    // Two fixed rotations tilt the cube so the front, top, and side can be seen.
    // This is not a camera, and it is not a matrix system.
    float yaw = 0.6;
    float pitch = -0.45;
    vec3 p = aPosition;

    float cy = cos(yaw);
    float sy = sin(yaw);
    float x = p.x * cy + p.z * sy;
    float z = -p.x * sy + p.z * cy;

    float cx = cos(pitch);
    float sx = sin(pitch);
    float y = p.y * cx - z * sx;
    z = p.y * sx + z * cx;

    gl_Position = vec4(x, y, z, 1.0);
}
