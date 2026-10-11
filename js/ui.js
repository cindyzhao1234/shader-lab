// Reads the HTML controls and reports what the user did.
// It does not create textures or talk to WebGL.

const placeholder = document.getElementById("placeholder");
const status = document.getElementById("status");
const imageInput = document.getElementById("imageInput");
const brightnessInput = document.getElementById("brightness");
const contrastInput = document.getElementById("contrast");
const saturationInput = document.getElementById("saturation");
const colorLevelsInput = document.getElementById("colorLevels");
const edgeThresholdInput = document.getElementById("edgeThreshold");
const brightnessValue = document.getElementById("brightnessValue");
const contrastValue = document.getElementById("contrastValue");
const saturationValue = document.getElementById("saturationValue");
const colorLevelsValue = document.getElementById("colorLevelsValue");
const edgeThresholdValue = document.getElementById("edgeThresholdValue");
const resetButton = document.getElementById("reset");

export function setStatus(message)
{
    status.textContent = message;
}

export function hidePlaceholder()
{
    placeholder.hidden = true;
}

function updateSliderLabels()
{
    brightnessValue.textContent = Number(brightnessInput.value).toFixed(2);
    contrastValue.textContent = Number(contrastInput.value).toFixed(2);
    saturationValue.textContent = Number(saturationInput.value).toFixed(2);
    colorLevelsValue.textContent = String(Number(colorLevelsInput.value));
    edgeThresholdValue.textContent = Number(edgeThresholdInput.value).toFixed(2);
}

// The callbacks are how UI events reach the rest of the app.
export function initUI({ onImage, onBrightness, onContrast, onSaturation, onColorLevels, onEdgeThreshold, onReset })
{
    imageInput.addEventListener("change", () =>
    {
        const file = imageInput.files[0];

        if (!file)
        {
            return;
        }

        onImage(file);
    });

    brightnessInput.addEventListener("input", () =>
    {
        updateSliderLabels();
        onBrightness(Number(brightnessInput.value));
    });

    contrastInput.addEventListener("input", () =>
    {
        updateSliderLabels();
        onContrast(Number(contrastInput.value));
    });

    saturationInput.addEventListener("input", () =>
    {
        updateSliderLabels();
        onSaturation(Number(saturationInput.value));
    });

    colorLevelsInput.addEventListener("input", () =>
    {
        updateSliderLabels();
        onColorLevels(Number(colorLevelsInput.value));
    });

    edgeThresholdInput.addEventListener("input", () =>
    {
        updateSliderLabels();
        onEdgeThreshold(Number(edgeThresholdInput.value));
    });

    resetButton.addEventListener("click", () =>
    {
        brightnessInput.value = "0";
        contrastInput.value = "1";
        saturationInput.value = "1";
        colorLevelsInput.value = "32";
        edgeThresholdInput.value = "0.15";
        updateSliderLabels();
        onReset();
    });
}
