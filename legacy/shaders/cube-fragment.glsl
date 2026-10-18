#version 300 es

precision highp float;

in vec3 vColor;
in vec3 vWorldNormal;
in vec3 vWorldTangent;
in float vTangentW;
in vec3 vWorldPosition;
in vec2 vUv;

// 0 faces, 1 geometric normals, 2 diffuse, 3 full lighting,
// 4 UVs, 5 lighting normals, 6 specular, 7 shadow visibility.
uniform int uDisplayMode;

uniform vec3 uCameraPosition;
uniform vec3 uBaseColor;
uniform float uShininess;
uniform float uSpecularStrength;
uniform float uAmbient;
uniform float uDiffuseIntensity;
uniform float uSpecularIntensity;
uniform vec2 uUvTile;
uniform int uUseTexture;
uniform int uUseNormalMap;
uniform float uNormalStrength;
uniform int uMeshHasUvs;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;

const int MAX_LIGHTS = 4;
uniform int uLightCount;
uniform int uLightEnabled[MAX_LIGHTS];
uniform int uLightType[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];
uniform vec3 uLightDirection[MAX_LIGHTS];
uniform vec3 uLightPosition[MAX_LIGHTS];
uniform float uLightIntensity[MAX_LIGHTS];
uniform float uLightRange[MAX_LIGHTS];
uniform float uLightInnerCos[MAX_LIGHTS];
uniform float uLightOuterCos[MAX_LIGHTS];

uniform int uShadowsEnabled;
uniform int uShadowLightIndex;
uniform float uShadowBias;
uniform int uShadowSoftness;
uniform mat4 uLightViewProjection;
uniform sampler2D uShadowMap;

out vec4 fragColor;

float shadowVisibility(vec3 worldPosition)
{
    if (uShadowsEnabled == 0)
    {
        return 1.0;
    }

    vec4 lightClip = uLightViewProjection * vec4(worldPosition, 1.0);
    vec3 ndc = lightClip.xyz / lightClip.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    float currentDepth = ndc.z * 0.5 + 0.5;

    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || currentDepth > 1.0)
    {
        return 1.0;
    }

    vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
    float lit = 0.0;
    float samples = 0.0;

    for (int y = -2; y <= 2; y++)
    {
        for (int x = -2; x <= 2; x++)
        {
            if (abs(x) > uShadowSoftness || abs(y) > uShadowSoftness)
            {
                continue;
            }

            float closest = texture(uShadowMap, uv + vec2(x, y) * texel).r;
            lit += currentDepth - uShadowBias <= closest ? 1.0 : 0.0;
            samples += 1.0;
        }
    }

    return lit / samples;
}

void main()
{
    vec3 geometricNormal = normalize(vWorldNormal);
    vec2 uv = vUv * uUvTile;
    vec3 albedo = uBaseColor;

    if (uUseTexture == 1)
    {
        albedo *= texture(uAlbedoMap, uv).rgb;
    }

    // A tangent-space normal map stores the bent normal in the texture's own axes.
    // T, B, and N carry that into world space, where the lights already live.
    vec3 lightingNormal = geometricNormal;

    if (uUseNormalMap == 1)
    {
        vec3 tangentNormal = texture(uNormalMap, uv).rgb * 2.0 - 1.0;
        tangentNormal.xy *= uNormalStrength;
        vec3 T = normalize(vWorldTangent);
        T = normalize(T - geometricNormal * dot(geometricNormal, T));
        vec3 B = cross(geometricNormal, T) * vTangentW;
        lightingNormal = normalize(mat3(T, B, geometricNormal) * tangentNormal);
    }

    vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
    vec3 directDiffuse = vec3(0.0);
    vec3 directSpecular = vec3(0.0);
    float shadowFactor = 1.0;

    for (int index = 0; index < MAX_LIGHTS; index++)
    {
        if (index >= uLightCount || uLightEnabled[index] == 0)
        {
            continue;
        }

        vec3 lightVector;
        float attenuation = 1.0;
        float spot = 1.0;

        if (uLightType[index] == 0)
        {
            // Directional: the uniform already points from the surface toward the light.
            lightVector = uLightDirection[index];
        }
        else
        {
            lightVector = uLightPosition[index] - vWorldPosition;
            float distanceToLight = length(lightVector);
            float range = max(uLightRange[index], 0.001);
            attenuation = 1.0 / (1.0 + (distanceToLight * distanceToLight) / (range * range));

            if (uLightType[index] == 2)
            {
                // The cone axis points the way the spotlight shines, opposite the vector toward the bulb.
                float cosAngle = dot(normalize(-lightVector), normalize(uLightDirection[index]));
                spot = smoothstep(uLightOuterCos[index], uLightInnerCos[index], cosAngle);
            }
        }

        vec3 L = normalize(lightVector);
        float ndotl = max(dot(lightingNormal, L), 0.0);
        vec3 R = reflect(-L, lightingNormal);
        float specular = pow(max(dot(R, viewDirection), 0.0), uShininess);

        if (ndotl <= 0.0)
        {
            specular = 0.0;
        }

        float shadow = 1.0;

        if (uShadowsEnabled == 1 && index == uShadowLightIndex && uLightType[index] == 0)
        {
            shadow = shadowVisibility(vWorldPosition);
            shadowFactor = shadow;
        }

        vec3 light = uLightColor[index] * uLightIntensity[index] * attenuation * spot * shadow;
        directDiffuse += light * ndotl;
        directSpecular += light * specular;
    }

    // Ambient is added once. It is not repeated inside the light loop.
    vec3 diffuseColor = albedo * (uAmbient + directDiffuse * uDiffuseIntensity);
    vec3 specularColor = directSpecular * uSpecularStrength * uSpecularIntensity;
    vec3 fullColor = diffuseColor + specularColor;

    vec3 color = vColor;

    if (uDisplayMode == 1)
    {
        color = geometricNormal * 0.5 + 0.5;
    }
    else if (uDisplayMode == 2)
    {
        color = diffuseColor;
    }
    else if (uDisplayMode == 3)
    {
        color = fullColor;
    }
    else if (uDisplayMode == 4)
    {
        color = uMeshHasUvs == 1 ? vec3(fract(uv), 0.0) : vec3(0.35, 0.0, 0.35);
    }
    else if (uDisplayMode == 5)
    {
        color = lightingNormal * 0.5 + 0.5;
    }
    else if (uDisplayMode == 6)
    {
        color = specularColor;
    }
    else if (uDisplayMode == 7)
    {
        color = vec3(shadowFactor);
    }

    fragColor = vec4(color, 1.0);
}
