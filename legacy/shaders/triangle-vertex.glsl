#version 300 es

// Each call receives one vertex from the buffer, through aPosition.
in vec2 aPosition;

void main()
{
    // gl_Position is this vertex in clip space.
    // x and y run from -1 to 1 across the canvas. z is depth. w must be 1 here.
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
