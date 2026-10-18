//takes selected image and decodes it into something the browser understands, then copy that into GPU so GLSL shader can use


export function loadImage(file) //export so other java files are allowed to use this function. In main, we load image
{
   const url = URL.createObjectURL(file); //get a temporary url that represents this file
   const image = new Image(); //create html image object in JS. image currently has nothing 
	
// loading an image takes time, a Promise is something that will be finished in the future. Two outcomes: resolve (accept), reject
   return new Promise((resolve, reject) =>
   {
       image.onload = () => //when successfully loaded image, run this func
       {
           URL.revokeObjectURL(url); //can get rid of temporary url we made earlier
           resolve(image); //success, here is the loaded image
       }; 


       image.onerror = () => //loading fails
       {
           URL.revokeObjectURL(url); //still clear temporary url
           reject(new Error("Could not load that image."));
       };


       image.src = url; //load the image stored at this temporary url
   });
}


// Copies the decoded image into a texture the fragment shader can sample.
export function createTexture(gl, image)
{
   const texture = gl.createTexture(); //ask webGL to create a new texture object
   gl.bindTexture(gl.TEXTURE_2D, texture); //make texture the texture currently working with 


   // flip the y axis 
   gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
   
   //image gets uploaded to webgl
   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

   // Without a filter mode, sampling a texture is incomplete and draws black.
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


   return texture;
}

export function createSolidTexture(gl, red, green, blue, alpha)
{
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([red, green, blue, alpha])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

function canvasTexture(gl, canvas, mipmaps)
{
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    if (mipmaps)
    {
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

export function createCheckerTexture(gl)
{
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const squares = 8;
    const size = canvas.width / squares;

    for (let y = 0; y < squares; y++)
    {
        for (let x = 0; x < squares; x++)
        {
            const light = (x + y) % 2 === 0;
            context.fillStyle = light ? "#f4f1e8" : "#2a3344";
            context.fillRect(x * size, y * size, size, size);
        }
    }

    return canvasTexture(gl, canvas, true);
}

export function createDemoNormalTexture(gl)
{
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    const pixels = image.data;

    for (let y = 0; y < size; y++)
    {
        for (let x = 0; x < size; x++)
        {
            const u = x / size;
            const v = y / size;
            const dx = Math.cos(u * Math.PI * 8) * Math.sin(v * Math.PI * 8);
            const dy = Math.sin(u * Math.PI * 8) * Math.cos(v * Math.PI * 8);
            const length = Math.hypot(dx, dy, 1);
            const index = (y * size + x) * 4;
            pixels[index] = Math.round((dx / length * 0.5 + 0.5) * 255);
            pixels[index + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
            pixels[index + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
            pixels[index + 3] = 255;
        }
    }

    context.putImageData(image, 0, 0);
    return canvasTexture(gl, canvas, true);
}

export function uploadImageTexture(gl, image)
{
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

export function configureTexture(gl, texture, repeat, linear)
{
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST
    );
}
