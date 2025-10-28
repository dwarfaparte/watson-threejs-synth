// displays.js

// --- IMPORTS ---
// Import THREE.js. It's needed for CanvasTexture, Color, PointLight, etc.
import * as THREE from 'three';

// +++ NEW: Button State & Material References +++
let redLightMaterial = null;
let greenLightMaterial = null;
let currentButtonState = 0; // 0 = Off, 1 = Red, 2 = Green

// --- DATA LOADING ---

/**
 * Loads and parses the displays.csv file.
 * @returns {Promise<Map<string, string[][]>>} A promise that resolves with the displayData map.
 */
export async function loadDisplayData() {
    // ... (This function remains unchanged) ...
    // This map is now local to this function and returned by the promise.
    const displayData = new Map(); 
    try {
        const response = await fetch('displays.csv');
        const data = await response.text();
        const lines = data.split('\n');

        // 1. Parse all 8 text values from each line into a temporary map
        const tempRowData = new Map();
        for (let i = 1; i < lines.length; i++) { // Start at 1 to skip header
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',');
            const objectNameKey = (parts[0] || "").trim(); // e.g., "Display01_L1"
            if (!objectNameKey) continue;

            const textValues = [];
            for (let j = 1; j <= 8; j++) { // Get Text1 through Text8
                const text = (parts[j] || "").trim().replace(/^"|"$/g, '');
                textValues.push(text);
            }
            tempRowData.set(objectNameKey, textValues);
        }

        // 2. Combine the L1 and L2 data into the final nested array structure
        const displayNames = ["Display01", "Display02"]; // Add more display names here if needed
        for (const name of displayNames) {
            const line1Data = tempRowData.get(`${name}_L1`);
            const line2Data = tempRowData.get(`${name}_L2`);

            if (!line1Data || !line2Data) {
                console.warn(`Missing L1 or L2 data for ${name}`);
                continue;
            }

            const combinedBlocks = []; // This will be [ ["B1_L1", "B1_L2"], ["B2_L1", "B2_L2"], ... ]
            for (let i = 0; i < 8; i++) {
                combinedBlocks.push([ line1Data[i] || "", line2Data[i] || "" ]);
            }
            
            displayData.set(name, combinedBlocks); // Set the final data for "Display01", "Display02", etc.
        }

        console.log('Display data loaded (from displays.js):', displayData);
        return displayData; // Resolve the promise with the data

    } catch (error) {
        console.error('Error loading display CSV data:', error);
        return displayData; // Return an empty map on error
    }
}


// --- TEXTURE CREATION ---

/**
 * Creates a THREE.CanvasTexture...
 * @returns {THREE.CanvasTexture}
 */
export function createTextTexture(displayName, textArray, renderer, width = 512, height = 128) {
    // ... (This function remains unchanged) ...
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    // Crispy pixel setting
    ctx.imageSmoothingEnabled = false; 

    // Background
    ctx.fillStyle = '#0a0a0a'; // Dark screen background
    ctx.fillRect(0, 0, width, height);

    // --- Define Grid ---
    const cols = 4;
    const rows = 2;
    const blockWidth = width / cols;
    const blockHeight = height / rows;

    // --- Draw Grid Lines ---
    ctx.strokeStyle = '#334444'; // Dark cyan, fits the theme
    ctx.lineWidth = 2;

    // 3 Vertical lines
    for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * blockWidth, 0);
        ctx.lineTo(i * blockWidth, height);
        ctx.stroke();
    }
    // 1 Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, blockHeight);
    ctx.lineTo(width, blockHeight);
    ctx.stroke();

    // --- Draw Text in Blocks ---
    ctx.fillStyle = '#70bdc0'; // Use your outline color for the text
    
    // NEW: Smaller font size to fit two lines
    const fontSize = blockHeight * 0.3; // 30% of block height
    ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`; 
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Align text vertically to the Y-coordinate

    for (let i = 0; i < 8; i++) {
        // NEW: Get the array [line1, line2] for this block
        const textBlock = textArray[i] || ["", ""]; 
        const line1 = textBlock[0] || "";
        const line2 = textBlock[1] || "";

        // Calculate grid position
        const col = i % cols;
        const row = Math.floor(i / cols);

        // Calculate center X
        const centerX = (col * blockWidth) + (blockWidth / 2);
        
        // NEW: Calculate Y positions for each line, relative to the block's top
        const blockTopY = row * blockHeight;
        const line1Y = blockTopY + (blockHeight * 0.35); // Position at 35% down
        const line2Y = blockTopY + (blockHeight * 0.70); // Position at 70% down

        // Draw the two lines
        if (line1) {
            ctx.fillText(line1, centerX, line1Y);
        }
        if (line2) {
            ctx.fillText(line2, centerX, line2Y);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    
    // This is why we need the renderer passed in:
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); 
    
    return texture;
}


// --- MODEL SETUP ---

/**
 * Traverses the model to apply display textures and attach lights to emissive materials.
 * @param {THREE.Object3D} model - The loaded GLTF scene.
 * @param {Map<string, string[][]>} displayData - The data from loadDisplayData.
 * @param {THREE.WebGLRenderer} renderer - The main renderer.
 */
export function setupDisplaysAndLights(model, displayData, renderer) {
    
    model.traverse((child) => {
        if (child.isMesh && child.material) {
            
            // --- BLOCK 1: Set up displays (Existing Logic) ---
            if (child.name === 'Display01' || child.name === 'Display02') {
                const defaultArray = [["1-1", "1-2"], ["2-1", "2-2"], ["3-1", "3-2"], ["4-1", "4-2"], ["5-1", "5-2"], ["6-1", "6-2"], ["7-1", "7-2"], ["8-1", "8-2"]];
                const textArray = displayData.get(child.name) || defaultArray;
                
                // Pass renderer to the texture function
                const texture = createTextTexture(child.name, textArray, renderer); 

                const processMaterial = (material) => {
                    material.map = texture;
                    material.emissiveMap = texture; // Make the text glow
                    material.emissive = new THREE.Color(0xffffff); // Glow full white
                    material.emissiveIntensity = 0.5; // Adjust glow brightness
                    material.toneMapped = false; // Makes the glow pop more
                    material.needsUpdate = true;
                };
                Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);
            } 
            // --- End of Block 1 ---

            // +++ NEW: Find and store light materials +++
            if (child.name === 'RedLight') {
                redLightMaterial = child.material;
                console.log('Found RedLight material');
            } else if (child.name === 'GreenLight') {
                greenLightMaterial = child.material;
                console.log('Found GreenLight material');
            }
            // +++ END NEW BLOCK +++


            // --- BLOCK 2: Add lights to ALL emissive materials (Existing Logic) ---
            const addLightIfEmissive = (material) => {
                // Check if material is emissive (color is not black AND intensity > 0)
                if (material.emissive && material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
                    
                    const light = new THREE.PointLight(
                        material.emissive.clone(),    // Use the material's emissive color
                        material.emissiveIntensity * 1.0, // Tweak this intensity multiplier!
                        10 // Tweak this distance! (0 = infinite)
                    );
                    
                    light.position.set(0, 0, 0); 
                    child.add(light); // Parent the light to the mesh

                    console.log(`Added PointLight to emissive mesh: ${child.name}`);
                }
            };

            // Run the helper function on the mesh's material(s)
            if (Array.isArray(child.material)) {
                child.material.forEach(addLightIfEmissive);
            } else {
                addLightIfEmissive(child.material);
            }
            // --- End of Block 2 ---
        }
    });
}


// +++ NEW: Button Click Logic Function +++
/**
 * Cycles through the 3-state light sequence for the soft buttons.
 */
export function cycleButtonState() {
    // 1. Increment and wrap state (0 -> 1 -> 2 -> 0)
    currentButtonState = (currentButtonState + 1) % 3;

    // 2. Check if materials were found
    if (!redLightMaterial || !greenLightMaterial) {
        console.error("RedLight or GreenLight material not found! Check model.");
        return;
    }

    // 3. Apply logic based on the *new* state
    switch (currentButtonState) {
        case 0: // Third click (Both OFF)
            console.log("Button State: 0 (Both OFF)");
            redLightMaterial.emissiveIntensity = 0.1;
            greenLightMaterial.emissiveIntensity = 0.1;
            break;
        case 1: // First click (Red ON)
            console.log("Button State: 1 (Red ON)");
            redLightMaterial.emissiveIntensity = 2;
            greenLightMaterial.emissiveIntensity = 0.1; // Ensure green is off
            break;
        case 2: // Second click (Green ON)
            console.log("Button State: 2 (Green ON)");
            redLightMaterial.emissiveIntensity = 0.1;
            greenLightMaterial.emissiveIntensity = 2;
            break;
    }
}