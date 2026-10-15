#version 300 es

precision highp float;

in vec3 vColor;

// World-space direction the surface points. The vertex shader already rotated it.
in vec3 vWorldNormal;

// World-space position of this fragment, after the model matrix.
in vec3 vWorldPosition;

// 0 face colours, 1 normal colours, 2 diffuse lighting, 3 diffuse plus specular.
uniform int uDisplayMode;

// Direction from the surface toward the light, in world space.
// A directional light is the same everywhere, like sunlight. It has no position.
uniform vec3 uLightDirection;

// Where the camera sits in world space.
uniform vec3 uCameraPosition;

// Material base colour. Ambient and diffuse scale this. The light direction is not part of it.
uniform vec3 uBaseColor;

// Material shininess. Higher values keep the highlight in a smaller patch.
uniform float uShininess;

// Material specular strength. How bright that patch is. This does not change its size.
uniform float uSpecularStrength;

// Scene light. These apply to every object. Each material still has its own colour and shininess.
uniform float uAmbient;
uniform float uDiffuseIntensity;
uniform float uSpecularIntensity;

out vec4 fragColor;

void main()
{
    // A normal component of -1 becomes colour 0. +1 becomes colour 1.
    vec3 normalColor = vWorldNormal * 0.5 + 0.5;

    // A zero vector has no direction. Fall back to straight up.
    vec3 lightDirection = uLightDirection;
    if (dot(lightDirection, lightDirection) < 0.000001)
    {
        lightDirection = vec3(0.0, 1.0, 0.0);
    }

    // Normal, light, and view all have to be world space, or the angles are meaningless.
    // normalize() makes each length 1, so a dot product is the cosine of the angle.
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(lightDirection);

    // From this surface point toward the camera. A different point gets a different view direction.
    vec3 V = normalize(uCameraPosition - vWorldPosition);

    // 1: the face points straight at the light. 0: the face is edge-on to the light.
    // A negative dot means the face points away. max() leaves that side unlit by this light.
    float ndotl = max(dot(N, L), 0.0);
    float diffuse = ndotl * uDiffuseIntensity;

    // -L is the incoming ray. reflect() bounces it off N.
    // R is the direction the bounced light travels. The highlight is strong where R aims at the camera.
    vec3 R = reflect(-L, N);
    float specular = pow(max(dot(R, V), 0.0), uShininess) * uSpecularStrength * uSpecularIntensity;

    // A face turned away from the light does not mirror it.
    if (ndotl <= 0.0)
    {
        specular = 0.0;
    }

    // Ambient is a flat fill, the same on every face.
    // Diffuse scales the base colour by the light angle.
    // Specular is added as its own white glint. It is not another multiplier on the base colour.
    vec3 litColor = uBaseColor * (uAmbient + diffuse);
    vec3 shinyColor = litColor + vec3(specular);

    vec3 color = vColor;
    if (uDisplayMode == 1)
    {
        color = normalColor;
    }
    else if (uDisplayMode == 2)
    {
        color = litColor;
    }
    else if (uDisplayMode == 3)
    {
        color = shinyColor;
    }

    fragColor = vec4(color, 1.0);
}
