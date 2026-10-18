#version 300 es

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
layout(location = 2) in vec3 aNormal;
layout(location = 3) in vec2 aUv;

// xyz is the tangent. w is +1 or -1, the UV island's handedness.
layout(location = 4) in vec4 aTangent;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

// Inverse-transpose of the model 3×3. Tangents use the model 3×3 instead.
uniform mat3 uNormalMatrix;

out vec3 vColor;
out vec3 vWorldNormal;
out vec3 vWorldTangent;
out float vTangentW;
out vec3 vWorldPosition;
out vec2 vUv;

void main()
{
    vColor = aColor;
    vUv = aUv;

    // Normals use the inverse-transpose so a non-uniform scale stays perpendicular.
    // Tangents travel with the surface, so they use the model matrix itself.
    vWorldNormal = normalize(uNormalMatrix * aNormal);
    vWorldTangent = normalize(mat3(uModel) * aTangent.xyz);
    vTangentW = aTangent.w;

    vec4 worldPosition = uModel * vec4(aPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = uProjection * uView * worldPosition;
}
