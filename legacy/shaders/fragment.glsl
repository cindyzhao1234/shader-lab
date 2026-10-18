#version 300 es

precision highp float; //tells gpu default precision to use for floating points

in vec2 vTexCoord; //uv coordinate telling the fragment where it is on the image

//external values the shader expects
uniform sampler2D uTexture;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uColorLevels;
uniform float uEdgeThreshold;
uniform float uOutlineThickness;

//0 shows the untouched texture. 1 shows the Cartoon result.
uniform float uCartoonEnabled;

out vec4 fragColor; //shader output

void main()
{   
    //Keep the uploaded pixel before brightness, quantisation, or outlines change it.
    vec3 originalColor = texture(uTexture, vTexCoord).rgb;
    vec3 color = originalColor;

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

    //uColorLevels is how many steps each of red, green, and blue may use.
    //It comes from the Colour Levels slider.
    //Lower values make bigger jumps, so the picture looks more stylised.
    //Higher values keep more of the original colour.
    color = floor(color * uColorLevels) / uColorLevels;

    //One texel, in UV. UV runs from 0 to 1 across the whole image.
    vec2 texel = 1.0 / vec2(textureSize(uTexture, 0));

    //uOutlineThickness is how many texels away the detector looks.
    //It does not draw a stroke of that width. A larger value samples farther away,
    //so more pixels near a contrast change count as an edge.
    vec2 offset = texel * uOutlineThickness;

    //Read the original texture, not the graded colour above.
    //The neighbours show whether this spot is brighter or darker than the texels beside it.
    vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);

    float left = dot(texture(uTexture, vTexCoord + vec2(-offset.x, 0.0)).rgb, lumaWeights);
    float right = dot(texture(uTexture, vTexCoord + vec2(offset.x, 0.0)).rgb, lumaWeights);
    float up = dot(texture(uTexture, vTexCoord + vec2(0.0, offset.y)).rgb, lumaWeights);
    float down = dot(texture(uTexture, vTexCoord + vec2(0.0, -offset.y)).rgb, lumaWeights);

    //How much the brightness changes across the texel, and up and down it.
    float horizontal = abs(left - right);
    float vertical = abs(up - down);

    //edgeStrength is the size of that jump. 0 is a flat area. Larger means a sharper edge.
    float edgeStrength = length(vec2(horizontal, vertical));

    //uEdgeThreshold is the smallest jump that counts as an outline.
    //It comes from the Edge Threshold slider. Raise it for fewer lines, lower it for more.
    //step() returns 0 below the threshold and 1 at or above it.
    //edgeMask is that yes/no choice: 0 means keep the colour, 1 means draw the line.
    float edgeMask = step(uEdgeThreshold, edgeStrength);

    vec3 outlineColor = vec3(0.0);

    //mix() returns color when the mask is 0, and outlineColor when the mask is 1.
    color = mix(color, outlineColor, edgeMask);

    //0 keeps originalColor. 1 keeps the finished Cartoon colour above.
    color = mix(originalColor, color, uCartoonEnabled);

    fragColor = vec4(color, 1.0);
}
