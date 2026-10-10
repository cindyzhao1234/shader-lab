#version 300 es

precision highp float; //tells gpu default precision to use for floating points

in vec2 vTexCoord; //uv coordinate telling the fragment where it is on the image

//external values the shader expects
uniform sampler2D uTexture;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;

out vec4 fragColor; //shader output

void main()
{   
    //read original pixel colour
    vec3 color = texture(uTexture, vTexCoord).rgb;

    //brightness changing
    //0 leaves the pic alone. Positive values push every channel toward white.
    color += uBrightness;

    //contrast changing
    //1 leaves the pic alone. The distance from mid-grey is scaled up or down.
    color = (color - 0.5) * uContrast + 0.5;

    //greyscale changing
    //Rec. 709 weights: green contributes most to perceived brightness.
    float grayscale = dot(color, vec3(0.2126, 0.7152, 0.0722));

    //saturation changing
    //0 is fully gray, 1 is the original colour, above 1 pushes colour further.
    color = mix(vec3(grayscale), color, uSaturation);

    //final colour
    fragColor = vec4(color, 1.0);
}
