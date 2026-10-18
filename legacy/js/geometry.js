// A mesh is shape data. It has no place in the scene.
// Each vertex is position, colour, normal, uv, then tangent xyz and a handedness in w.
// Handedness is +1 or -1 so a mirrored UV island still builds a right-handed tangent frame.

export const FLOATS_PER_VERTEX = 15;

function pushVertex(values, x, y, z, color, normal, u, v)
{
    values.push(
        x, y, z,
        color[0], color[1], color[2],
        normal[0], normal[1], normal[2],
        u, v,
        1, 0, 0, 1
    );
}

function subtract3(a, b)
{
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a, b)
{
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function dot3(a, b)
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Builds a tangent from positions and UVs. A zero-area UV triangle is skipped.
// The stored normal is not changed. Normal mapping only bends the shading normal.
export function writeTangents(vertices, indices)
{
    const stride = FLOATS_PER_VERTEX;
    const count = vertices.length / stride;
    const tangents = [];
    const bitangents = [];

    for (let index = 0; index < count; index++)
    {
        tangents.push([0, 0, 0]);
        bitangents.push([0, 0, 0]);
    }

    function positionAt(vertex)
    {
        const offset = vertex * stride;
        return [vertices[offset], vertices[offset + 1], vertices[offset + 2]];
    }

    function uvAt(vertex)
    {
        const offset = vertex * stride + 9;
        return [vertices[offset], vertices[offset + 1]];
    }

    for (let index = 0; index < indices.length; index += 3)
    {
        const i0 = indices[index];
        const i1 = indices[index + 1];
        const i2 = indices[index + 2];
        const edge1 = subtract3(positionAt(i1), positionAt(i0));
        const edge2 = subtract3(positionAt(i2), positionAt(i0));
        const uv1 = uvAt(i1);
        const uv2 = uvAt(i2);
        const uv0 = uvAt(i0);
        const du1 = uv1[0] - uv0[0];
        const dv1 = uv1[1] - uv0[1];
        const du2 = uv2[0] - uv0[0];
        const dv2 = uv2[1] - uv0[1];
        const determinant = du1 * dv2 - du2 * dv1;

        if (Math.abs(determinant) < 0.0000001)
        {
            continue;
        }

        const scale = 1 / determinant;
        const tangent = [
            (edge1[0] * dv2 - edge2[0] * dv1) * scale,
            (edge1[1] * dv2 - edge2[1] * dv1) * scale,
            (edge1[2] * dv2 - edge2[2] * dv1) * scale
        ];
        const bitangent = [
            (edge2[0] * du1 - edge1[0] * du2) * scale,
            (edge2[1] * du1 - edge1[1] * du2) * scale,
            (edge2[2] * du1 - edge1[2] * du2) * scale
        ];

        [i0, i1, i2].forEach((vertex) =>
        {
            tangents[vertex][0] += tangent[0];
            tangents[vertex][1] += tangent[1];
            tangents[vertex][2] += tangent[2];
            bitangents[vertex][0] += bitangent[0];
            bitangents[vertex][1] += bitangent[1];
            bitangents[vertex][2] += bitangent[2];
        });
    }

    for (let vertex = 0; vertex < count; vertex++)
    {
        const offset = vertex * stride;
        const normal = [vertices[offset + 6], vertices[offset + 7], vertices[offset + 8]];
        let tangent = tangents[vertex].slice();
        const alongNormal = dot3(normal, tangent);
        tangent = [
            tangent[0] - normal[0] * alongNormal,
            tangent[1] - normal[1] * alongNormal,
            tangent[2] - normal[2] * alongNormal
        ];
        let length = Math.hypot(tangent[0], tangent[1], tangent[2]);

        if (length < 0.0000001)
        {
            const helper = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            tangent = cross3(helper, normal);
            length = Math.hypot(tangent[0], tangent[1], tangent[2]) || 1;
        }

        tangent = [tangent[0] / length, tangent[1] / length, tangent[2] / length];
        const handed = dot3(cross3(normal, tangent), bitangents[vertex]) < 0 ? -1 : 1;
        vertices[offset + 11] = tangent[0];
        vertices[offset + 12] = tangent[1];
        vertices[offset + 13] = tangent[2];
        vertices[offset + 14] = handed;
    }
}

function createBox(width, height, depth, faceColors)
{
    const x = width / 2;
    const y = height / 2;
    const z = depth / 2;
    const values = [];

    function face(corners, normal, color)
    {
        const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];

        corners.forEach((corner, index) =>
        {
            pushVertex(values, corner[0], corner[1], corner[2], color, normal, uvs[index][0], uvs[index][1]);
        });
    }

    // Each face has its own four corners, so the UV seam is a real split rather than a shared vertex.
    face([[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z]], [0, 0, -1], faceColors[0]);
    face([[x, -y, z], [-x, -y, z], [-x, y, z], [x, y, z]], [0, 0, 1], faceColors[1]);
    face([[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]], [0, 1, 0], faceColors[2]);
    face([[-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z]], [0, -1, 0], faceColors[3]);
    face([[x, -y, -z], [x, -y, z], [x, y, z], [x, y, -z]], [1, 0, 0], faceColors[4]);
    face([[-x, -y, z], [-x, -y, -z], [-x, y, -z], [-x, y, z]], [-1, 0, 0], faceColors[5]);

    const indices = [];

    for (let faceIndex = 0; faceIndex < 6; faceIndex++)
    {
        const a = faceIndex * 4;
        indices.push(a, a + 3, a + 2, a, a + 2, a + 1);
    }

    const indexArray = new Uint16Array(indices);
    const vertices = new Float32Array(values);
    writeTangents(vertices, indexArray);

    return {
        vertices: vertices,
        indices: indexArray,
        halfHeight: y,
        hasUvs: true
    };
}

function createUvSphere(stacks, slices, radius, color, displace)
{
    const vertexValues = [];
    const indexValues = [];

    for (let stack = 0; stack <= stacks; stack++)
    {
        const phi = stack / stacks * Math.PI;
        const v = 1 - stack / stacks;

        for (let slice = 0; slice <= slices; slice++)
        {
            const theta = slice / slices * Math.PI * 2;
            const u = slice / slices;
            let x = Math.sin(phi) * Math.cos(theta);
            let y = Math.cos(phi);
            let z = Math.sin(phi) * Math.sin(theta);
            const bump = displace ? displace(x, y, z) : 0;
            const length = 1 + bump;

            // slice 0 and slice "slices" share a position but not a U, which keeps the seam from wrapping backwards.
            pushVertex(vertexValues, x * radius * length, y * radius * length, z * radius * length, color, [x, y, z], u, v);
        }
    }

    const row = slices + 1;

    for (let stack = 0; stack < stacks; stack++)
    {
        for (let slice = 0; slice < slices; slice++)
        {
            const a = stack * row + slice;
            const b = a + row;
            indexValues.push(a, a + 1, b);
            indexValues.push(a + 1, b + 1, b);
        }
    }

    const vertices = new Float32Array(vertexValues);
    const indices = new Uint16Array(indexValues);
    writeTangents(vertices, indices);

    return {
        vertices: vertices,
        indices: indices,
        halfHeight: radius,
        hasUvs: true
    };
}

export function createCubeMesh()
{
    return createBox(1, 1, 1, [
        [0.85, 0.25, 0.22],
        [0.25, 0.45, 0.90],
        [0.30, 0.75, 0.40],
        [0.90, 0.80, 0.30],
        [0.95, 0.55, 0.20],
        [0.30, 0.75, 0.85]
    ]);
}

export function createPlatformMesh()
{
    const gray = [0.45, 0.48, 0.42];

    return createBox(3.6, 0.16, 3.6, [gray, gray, gray, gray, gray, gray]);
}

export function createSphereMesh()
{
    return createUvSphere(16, 24, 0.5, [0.75, 0.75, 0.78], null);
}

export function createRockMesh()
{
    return createUvSphere(8, 12, 0.5, [0.55, 0.42, 0.32], (x, y, z) =>
    {
        return 0.16 * Math.sin(x * 9.0 + y * 4.0) * Math.cos(z * 7.0 + 1.7);
    });
}
