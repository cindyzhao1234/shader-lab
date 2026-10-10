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
