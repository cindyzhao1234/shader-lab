#version 300 es

//position of the current vertex (-1 to 1)
in vec2 aPosition; 

//uv coordinate belonging to this vertex (0 to 1)
in vec2 aTexCoord;

//expect a fitScale value to stop the image from stretching
uniform vec2 uFitScale;

//outputs vTexCoord so fragment shader knows where in the image it should sample
out vec2 vTexCoord;

void main()
{   
    //Put this corner of the rectangle in the correct position, shrinking it if necessary to preserve the image's aspect ratio. Then pass this corner's UV coordinate onward so the fragment shader knows which part of the image to use.
    gl_Position = vec4(aPosition * uFitScale, 0.0, 1.0);
    vTexCoord = aTexCoord;
}
