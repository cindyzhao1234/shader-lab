// A mesh is shape data: positions, colours, normals, and which corners form each triangle.
// It has no place in the scene. Several objects can point at the same mesh.

function createBox(width, height, depth, faceColors)
{
    const x = width / 2;
    const y = height / 2;
    const z = depth / 2;
    const values = [];

    function face(corners, normal, color)
    {
        corners.forEach((corner) =>
        {
            values.push(
                corner[0], corner[1], corner[2],
                color[0], color[1], color[2],
                normal[0], normal[1], normal[2]
            );
        });
    }

    // Each face lists its corners so the outside is counter-clockwise.
    // The index pattern below matches that order.
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

    return {
        vertices: new Float32Array(values),
        indices: new Uint16Array(indices),
        halfHeight: y
    };
}

function createUvSphere(stacks, slices, radius, color, displace)
{
    const vertexValues = [];
    const indexValues = [];

    for (let stack = 0; stack <= stacks; stack++)
    {
        const phi = stack / stacks * Math.PI;

        for (let slice = 0; slice <= slices; slice++)
        {
            const theta = slice / slices * Math.PI * 2;
            let x = Math.sin(phi) * Math.cos(theta);
            let y = Math.cos(phi);
            let z = Math.sin(phi) * Math.sin(theta);
            const bump = displace ? displace(x, y, z) : 0;
            const length = 1 + bump;

            vertexValues.push(
                x * radius * length, y * radius * length, z * radius * length,
                color[0], color[1], color[2],
                x, y, z
            );
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

    return {
        vertices: new Float32Array(vertexValues),
        indices: new Uint16Array(indexValues),
        halfHeight: radius
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
