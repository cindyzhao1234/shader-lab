import { loadImage } from "./texture.js";
import { hidePlaceholder, initUI, setStatus } from "./ui.js";
import {
    initWebGL,
    render,
    resetAdjustments,
    setBrightness,
    setContrast,
    setImage,
    setSaturation
} from "./webgl.js";


async function main()
{
    const canvas = document.getElementById("glCanvas");

    await initWebGL(canvas);

    initUI({
        onImage: async (file) =>
        {
            try
            {
                // Decode on the CPU, then upload. Later slider moves reuse that texture.
                const image = await loadImage(file);

                setImage(image);
                hidePlaceholder();
                setStatus("");
                render();
            }
            catch (error)
            {
                console.error(error);
                setStatus(error.message);
            }
        },

        onBrightness: (value) =>
        {
            setBrightness(value);
            render();
        },

        onContrast: (value) =>
        {
            setContrast(value);
            render();
        },

        onSaturation: (value) =>
        {
            setSaturation(value);
            render();
        },

        onReset: () =>
        {
            resetAdjustments();
            render();
        }
    });
}

main().catch((error) =>
{
    console.error(error);
    setStatus(error.userMessage || error.message);
});
