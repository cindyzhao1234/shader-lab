// A light is scene data, separate from any object's material.
// Direction for a directional light points from the surface toward the light.
// Direction for a spotlight is the way the cone points.

export const MAX_LIGHTS = 4;

export function createDirectionalLight(name, direction, color, intensity)
{
    return {
        name: name,
        type: "directional",
        enabled: true,
        direction: direction.slice(),
        position: [0, 2, 0],
        color: color.slice(),
        intensity: intensity,
        range: 6,
        innerAngle: 15,
        outerAngle: 28
    };
}

export function createPointLight(name, position, color, intensity, range)
{
    return {
        name: name,
        type: "point",
        enabled: true,
        direction: [0, -1, 0],
        position: position.slice(),
        color: color.slice(),
        intensity: intensity,
        range: range,
        innerAngle: 15,
        outerAngle: 28
    };
}

export function createSpotLight(name, position, direction, color, intensity, range, innerAngle, outerAngle)
{
    return {
        name: name,
        type: "spot",
        enabled: true,
        direction: direction.slice(),
        position: position.slice(),
        color: color.slice(),
        intensity: intensity,
        range: range,
        innerAngle: innerAngle,
        outerAngle: outerAngle
    };
}

export function defaultLights()
{
    return [
        createDirectionalLight("Sun", [0.45, 1, 0.2], [1, 1, 1], 1),
        createPointLight("Warm Point", [-1.1, 0.7, 0.4], [1, 0.5, 0.18], 2.2, 3.5),
        createSpotLight("Cool Spot", [0.3, 2.1, 1.5], [-0.15, -0.85, -0.55], [0.45, 0.7, 1], 3, 7, 12, 26)
    ];
}
