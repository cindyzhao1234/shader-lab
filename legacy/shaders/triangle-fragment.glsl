#version 300 es

precision highp float;

out vec4 fragColor;

void main()
{
    // Every fragment generated inside the triangle gets this same colour.
    fragColor = vec4(0.95, 0.75, 0.25, 1.0);
}
