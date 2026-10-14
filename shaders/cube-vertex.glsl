#version 300 es

// x, y, and z for one corner of the cube, in model space.
in vec3 aPosition;

// The colour of the face this corner belongs to.
in vec3 aColor;

// Moves, turns, and scales the cube. JavaScript fills this in before each draw.
uniform mat4 uModel;

// Passed to the fragment shader. A face is one colour, so its pixels stay flat.
out vec3 vColor;

void main()
{
    vColor = aColor;

    // aPosition is model space: the cube's own coordinates, unchanged in the vertex buffer.
    // w is 1 so the translation stored in uModel applies to this point. A direction would use 0.
    // There is no camera yet, so this result is written straight into clip space.
    gl_Position = uModel * vec4(aPosition, 1.0);
}
