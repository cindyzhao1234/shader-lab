#version 300 es

// Model space: the cube's own coordinates, unchanged in the vertex buffer.
in vec3 aPosition;

// The colour of the face this corner belongs to.
in vec3 aColor;

// The direction this face points, in model space. One face has one normal.
in vec3 aNormal;

// This object's model space → world space. It changes for every object in the scene.
uniform mat4 uModel;

// World space → view space. The camera sits at the origin, looking down -Z.
uniform mat4 uView;

// View space → clip space. This is the perspective frustum.
uniform mat4 uProjection;

out vec3 vColor;

// The same direction after the model matrix, so lighting can compare it with a world-space light.
out vec3 vWorldNormal;

// Where this vertex sits in the world. The fragment shader aims the view direction from here.
out vec3 vWorldPosition;

void main()
{
    vColor = aColor;

    // Uniform scale does not change a direction, so the model matrix's 3×3 is enough.
    // Translation is in the fourth column, and mat3 ignores it.
    // A non-uniform scale would need the inverse transpose, so squashed faces stay perpendicular.
    // normalize() puts the length back to 1. The dot product later should measure the angle,
    // and a leftover scale would make a face look brighter just because the cube is larger.
    // Rotation changes this world direction, so a fixed light then hits the face at a new angle.
    vWorldNormal = normalize(mat3(uModel) * aNormal);

    // w is 1 here so the translation columns apply.
    vec4 worldPosition = uModel * vec4(aPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    // View space puts the camera at the origin, looking down -Z.
    // Clip space follows. WebGL divides xyz by w after this shader returns.
    gl_Position = uProjection * uView * worldPosition;
}
