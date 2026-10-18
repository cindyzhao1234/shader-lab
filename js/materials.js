// A material is appearance data: the colour of the surface, and how it mirrors the light.
// It does not store a shape, a camera, or a light direction.
// These four presets are artistic Phong approximations, not measured materials.
// A later look system can swap this data without rewriting the lighting maths.

export const materialPresets = {
    matte: {
        name: "Matte",
        baseColor: [0.62, 0.38, 0.28],
        specularStrength: 0.02,
        shininess: 2
    },
    plastic: {
        name: "Plastic",
        baseColor: [0.20, 0.45, 0.86],
        specularStrength: 0.60,
        shininess: 32
    },
    glossy: {
        name: "Glossy",
        baseColor: [0.12, 0.13, 0.16],
        specularStrength: 1.00,
        shininess: 110
    },
    ceramic: {
        name: "Ceramic",
        baseColor: [0.86, 0.84, 0.78],
        specularStrength: 0.35,
        shininess: 48
    }
};

// A fresh copy, so editing the surface does not change the preset it came from.
export function copyMaterial(material)
{
    return {
        baseColor: material.baseColor.slice(),
        specularStrength: material.specularStrength,
        shininess: material.shininess,
        useTexture: Boolean(material.useTexture),
        wrapRepeat: material.wrapRepeat !== false,
        filterLinear: material.filterLinear !== false,
        tileU: material.tileU === undefined ? 1 : material.tileU,
        tileV: material.tileV === undefined ? 1 : material.tileV,
        albedo: material.albedo || null,
        useNormalMap: Boolean(material.useNormalMap),
        normalStrength: material.normalStrength === undefined ? 1 : material.normalStrength,
        normalMap: material.normalMap || null
    };
}

function colorByte(value)
{
    return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

// The colour picker stores whole bytes, so a match ignores float noise below one byte.
export function sameMaterial(a, b)
{
    const sameColor = a.baseColor.every((channel, index) =>
    {
        return colorByte(channel) === colorByte(b.baseColor[index]);
    });

    return sameColor
        && Math.abs(a.specularStrength - b.specularStrength) < 0.005
        && a.shininess === b.shininess;
}
