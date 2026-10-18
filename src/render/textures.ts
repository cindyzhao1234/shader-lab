import * as THREE from "three";

/**
 * Procedural textures for the demo scene, ported from the original
 * `legacy/js/texture.js`. Generating them avoids shipping binary assets and
 * keeps the first paint instant.
 */

function canvasTexture(canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function createCheckerTexture(squares = 8, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create a 2D canvas for the checker texture.");
  }

  const cell = size / squares;

  for (let y = 0; y < squares; y += 1) {
    for (let x = 0; x < squares; x += 1) {
      context.fillStyle = (x + y) % 2 === 0 ? "#f4f1e8" : "#2a3344";
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // A colour texture carries sRGB values and must be flagged as such, or three
  // will light it without linearising and the result is washed out.
  return canvasTexture(canvas, THREE.SRGBColorSpace);
}

export function createRippleNormalTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create a 2D canvas for the normal texture.");
  }

  const image = context.createImageData(size, size);
  const pixels = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const dx = Math.cos(u * Math.PI * 8) * Math.sin(v * Math.PI * 8);
      const dy = Math.sin(u * Math.PI * 8) * Math.cos(v * Math.PI * 8);
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;

      pixels[index] = Math.round(((dx / length) * 0.5 + 0.5) * 255);
      pixels[index + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
      pixels[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      pixels[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  // A normal map stores directions, not colour. Tagging it sRGB would bend
  // every normal it encodes.
  return canvasTexture(canvas, THREE.NoColorSpace);
}
