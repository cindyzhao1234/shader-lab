# Game Look Lab

A small WebGL project for experimenting with the visual look of game images.

Currently, you can upload an image and adjust its:
- Brightness
- Contrast
- Saturation

The image updates in real time using GLSL shaders.

## Running the Project

Run the project using a local server such as the VS Code **Live Server** extension.

The project needs a local server because the GLSL shader files are loaded separately.

## How It Works

The basic rendering pipeline is:

HTML controls
↓
JavaScript
↓
WebGL
↓
Vertex Shader
↓
Fragment Shader
↓
Canvas

### JavaScript

JavaScript handles the application side of the project.

It:
- Reads the uploaded image
- Handles the sliders
- Creates the WebGL texture
- Sends values to the shaders using uniforms
- Tells WebGL when to render

For example:

Slider → JavaScript brightness value → `uBrightness` uniform → shader

### WebGL

WebGL connects the JavaScript application to the GPU.

The uploaded image is converted into a **texture**, while values such as brightness, contrast and saturation are sent to the shaders as **uniforms**.

A uniform is an input to a shader whose value stays the same across a draw call.

## Vertex Shader

`shaders/vertex.glsl`

The vertex shader controls **where the image is drawn**.

The image is drawn on a rectangle made from two triangles.

The vertex shader:
- Positions the rectangle
- Keeps the image's correct aspect ratio
- Passes UV coordinates (`vTexCoord`) to the fragment shader

The GPU interpolates the UV coordinates between the rectangle's vertices.

## Fragment Shader

`shaders/fragment.glsl`

The fragment shader controls **what the image looks like**.

For each fragment, it:
1. Uses the UV coordinate to sample a colour from the uploaded texture
2. Adjusts brightness
3. Adjusts contrast
4. Adjusts saturation
5. Outputs the final colour

Current shader controls:

- **Brightness:** `0` = original
- **Contrast:** `1` = original
- **Saturation:** `0` = grayscale, `1` = original

## Current Pipeline

Uploaded Image
↓
WebGL Texture
↓
Vertex Shader
↓
Fragment Shader
↓
Brightness / Contrast / Saturation
↓
Canvas

## Current Goal

This is an early prototype for a larger game look-development tool.

Future versions will experiment with more shader-based effects, presets, comparison tools, and other ways of quickly testing different visual styles for games.