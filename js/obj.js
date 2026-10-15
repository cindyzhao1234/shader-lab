// An OBJ file is a text list of positions, optional normals, and faces.
// A face names corners by index. Position index 1 is the first "v" line.
// A negative index counts backward from the end.
// WebGL wants one index per combined vertex, so this loader welds position/normal pairs.

function resolveIndex(index, length)
{
    if (!Number.isFinite(index) || index === 0)
    {
        throw new Error("A face uses an index that is not a number.");
    }

    const resolved = index < 0 ? length + index : index - 1;

    if (resolved < 0 || resolved >= length)
    {
        throw new Error("A face points at a vertex that is not in the file.");
    }

    return resolved;
}

function parseCorner(token)
{
    const bits = token.split("/");
    const position = Number(bits[0]);
    let normal = null;

    // v/vt/vn and v//vn both put the normal in the third slot.
    if (bits.length >= 3 && bits[2] !== "")
    {
        normal = Number(bits[2]);
    }

    return {
        position: position,
        normal: normal
    };
}

function triangleNormal(a, b, c)
{
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];

    return [
        uy * vz - uz * vy,
        uz * vx - ux * vz,
        ux * vy - uy * vx
    ];
}

function generateNormals(positions, triangles)
{
    const accum = positions.map(() => [0, 0, 0]);

    triangles.forEach((triangle) =>
    {
        const a = positions[triangle[0].position];
        const b = positions[triangle[1].position];
        const c = positions[triangle[2].position];
        const normal = triangleNormal(a, b, c);

        triangle.forEach((corner) =>
        {
            const sum = accum[corner.position];
            sum[0] += normal[0];
            sum[1] += normal[1];
            sum[2] += normal[2];
        });
    });

    return accum.map((sum) =>
    {
        const length = Math.hypot(sum[0], sum[1], sum[2]);

        if (length === 0)
        {
            return [0, 1, 0];
        }

        return [sum[0] / length, sum[1] / length, sum[2] / length];
    });
}

// Moves the shape to the origin and scales its longest side to targetSize.
// Every axis uses the same scale, so the proportions stay as they were in the file.
export function fitMesh(vertices, targetSize)
{
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let index = 0; index < vertices.length; index += 9)
    {
        for (let axis = 0; axis < 3; axis++)
        {
            min[axis] = Math.min(min[axis], vertices[index + axis]);
            max[axis] = Math.max(max[axis], vertices[index + axis]);
        }
    }

    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    const scale = targetSize / size;

    for (let index = 0; index < vertices.length; index += 9)
    {
        for (let axis = 0; axis < 3; axis++)
        {
            const center = (min[axis] + max[axis]) / 2;
            vertices[index + axis] = (vertices[index + axis] - center) * scale;
        }
    }

    return {
        halfHeight: (max[1] - min[1]) * scale / 2
    };
}

export function parseObj(text)
{
    const positions = [];
    const normals = [];
    const triangles = [];
    const lines = text.split(/\r?\n/);

    lines.forEach((raw) =>
    {
        const line = raw.trim();

        if (line === "" || line.startsWith("#"))
        {
            return;
        }

        const parts = line.split(/\s+/);
        const tag = parts[0];

        if (tag === "v" && parts.length >= 4)
        {
            positions.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
        }
        else if (tag === "vn" && parts.length >= 4)
        {
            normals.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
        }
        else if (tag === "f" && parts.length >= 4)
        {
            const corners = parts.slice(1).map(parseCorner);

            // A quad or n-gon becomes a fan of triangles around the first corner.
            // Each triangle gets its own corner records so an index is resolved once.
            for (let index = 1; index < corners.length - 1; index++)
            {
                triangles.push([
                    { position: corners[0].position, normal: corners[0].normal },
                    { position: corners[index].position, normal: corners[index].normal },
                    { position: corners[index + 1].position, normal: corners[index + 1].normal }
                ]);
            }
        }
    });

    if (positions.length === 0 || triangles.length === 0)
    {
        throw new Error("This OBJ file has no triangle geometry.");
    }

    triangles.forEach((triangle) =>
    {
        triangle.forEach((corner) =>
        {
            corner.position = resolveIndex(corner.position, positions.length);

            if (corner.normal !== null)
            {
                corner.normal = resolveIndex(corner.normal, normals.length);
            }
        });
    });

    const missingNormal = triangles.some((triangle) =>
    {
        return triangle.some((corner) => corner.normal === null);
    });
    const generated = missingNormal ? generateNormals(positions, triangles) : null;
    const welded = new Map();
    const vertexValues = [];
    const indexValues = [];

    triangles.forEach((triangle) =>
    {
        triangle.forEach((corner) =>
        {
            const normalIndex = generated ? corner.position : corner.normal;
            const key = corner.position + "/" + normalIndex;

            if (!welded.has(key))
            {
                const position = positions[corner.position];
                const normal = generated ? generated[corner.position] : normals[corner.normal];

                welded.set(key, vertexValues.length / 9);
                vertexValues.push(
                    position[0], position[1], position[2],
                    0.75, 0.75, 0.78,
                    normal[0], normal[1], normal[2]
                );
            }

            indexValues.push(welded.get(key));
        });
    });

    const IndexArray = vertexValues.length / 9 > 65535 ? Uint32Array : Uint16Array;

    return {
        vertices: new Float32Array(vertexValues),
        indices: new IndexArray(indexValues)
    };
}
