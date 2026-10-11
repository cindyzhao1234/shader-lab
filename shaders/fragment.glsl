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

    //levels is how many steps each of red, green, and blue may use.
    //4 means a channel can only land on a few bands instead of any shade.
    //Lower levels make bigger jumps, so the picture looks more stylised.
    //Higher levels keep more of the original colour.
    float levels = 32.0;

    //sort the color into levels
    color = floor(color * levels) / levels;

    //get the texel
    vec2 texel = 1.0 / vec2(textureSize(uTexture, 0));

    //Read the original texture, not the graded colour above.
    //The neighbours show whether this spot is brighter or darker than the texels beside it.
    vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);

    float left = dot(texture(uTexture, vTexCoord + vec2(-texel.x, 0.0)).rgb, lumaWeights);
    float right = dot(texture(uTexture, vTexCoord + vec2(texel.x, 0.0)).rgb, lumaWeights);
    float up = dot(texture(uTexture, vTexCoord + vec2(0.0, texel.y)).rgb, lumaWeights);
    float down = dot(texture(uTexture, vTexCoord + vec2(0.0, -texel.y)).rgb, lumaWeights);

    //How much the brightness changes across the texel, and up and down it.
    float horizontal = abs(left - right);
    float vertical = abs(up - down);

    //edgeStrength is the size of that jump. 0 is a flat area. Larger means a sharper edge.
    float edgeStrength = length(vec2(horizontal, vertical));

    //Show the edge map instead of the quantised colour.
    fragColor = vec4(vec3(edgeStrength), 1.0);
}
