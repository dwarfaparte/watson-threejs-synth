import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// --- REMOVED: MapControls import ---
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

// --- RAYCASTING & OUTLINE VARIABLES ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null; // <-- RENAMED
let outlinePass;

// --- DRAG & ROTATION VARIABLES ---
let isDragging = false;
const previousMousePosition = {
    x: 0,
    y: 0
    };
    let rotationVelocityY = 0; // <-- ADD: Stores the current spin speed
    const INERTIA_DAMPING = 0.97; // <-- ADD: Friction (0.9 = fast stop, 0.99 = long drift)
    const DRAG_SENSITIVITY = 0.005; // <-- ADD: Your existing sensitivity as a constant

// --- DISPLAY & DATA VARIABLES ---
let descriptionDisplayElement; 
let currentDescriptionText = ""; 
let knobDescriptions = new Map();

// --- NEW: GUI DISPLAY CANVAS VARIABLES ---
let displayCanvas01 = null; // Will store the <canvas> for Display01
let displayCanvas02 = null; // Will store the <canvas> for Display02
let guiDisplayHost = null;  // The HTML div that will hold the canvas

// --- CSV DATA LOADING ---
async function loadKnobData() {
    try {
        const response = await fetch('tooltips.csv');
        const data = await response.text();
        const lines = data.split('\n'); 
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const commaIndex = line.indexOf(',');
                if (commaIndex !== -1) {
                    const name = line.substring(0, commaIndex).trim();
                    const description = line.substring(commaIndex + 1).trim().replace(/^"|"$/g, ''); 
                    knobDescriptions.set(name, description);
                }
            }
        }
        console.log('Knob descriptions loaded:', knobDescriptions);
    } catch (error) {
        console.error('Error loading CSV data:', error);
    }
}

// --- NEW: DISPLAY TEXT LOADING ---
let displayData = new Map();
let displayDataPromise; // To await this in the loader

// Loads text data for the synth displays from a CSV.

async function loadDisplayData() {
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

        console.log('Display data loaded (wide row format):', displayData);
    } catch (error) {
        console.error('Error loading display CSV data:', error);
    }
}

/**
 * Creates a THREE.CanvasTexture with a 4x2 grid of text, with 2 lines per block.
 * @param {string} displayName - The name of the display ("Display01" or "Display02")
 * @param {string[][]} textArray - An array of 8 arrays, each containing 2 strings.
 * @param {number} [width=512] - Canvas width.
 * @param {number} [height=128] - Canvas height.
 * @returns {THREE.CanvasTexture}
 */
function createTextTexture(displayName, textArray, width = 512, height = 128) { // <-- MODIFIED
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

    // --- NEW: Save canvas to global variable ---
    if (displayName === 'Display01') {
        displayCanvas01 = canvas;
    } else if (displayName === 'Display02') {
        displayCanvas02 = canvas;
    }
    // --- END NEW ---

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Improves quality
    
    return texture;
}

// Start loading both data files
loadKnobData();
displayDataPromise = loadDisplayData(); 

// --- PULSE VARIABLES ---
let clock = new THREE.Clock();
const PULSE_MIN_INTENSITY = 8; 
const PULSE_MAX_INTENSITY = 8.5; 
const PULSE_SPEED = 2; 

// --- FADE-IN & ZOOM-IN VARIABLES ---
let modelToFadeIn; 
const FADE_SPEED = 0.0025; 
let isFadingIn = false;

// Zoom-in variables
const INITIAL_RADIUS = 70;
const FINAL_RADIUS = 40; 
const MIN_ZOOM_RADIUS = 10;
const MAX_ZOOM_RADIUS = 70;

const EASE_FACTOR = 0.02; 
const DEFAULT_ROTATION_X = THREE.MathUtils.degToRad(330);
let currentRadius = INITIAL_RADIUS;

// 1. Setup the Scene, Camera, and Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({ antiallias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

// --- BACKGROUND TEXTURE LOADING ---
const textureLoader = new THREE.TextureLoader();
const backgroundPath = 'Synth Model/skybox_bright.jpg';

textureLoader.load(
    backgroundPath,
    function(texture) {
        scene.background = texture;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture; // Set environment for reflections
    },
    undefined,
    function(error) {
        console.error('An error happened while loading the background texture:', error);
        scene.background = new THREE.Color(0xcccccc);
    }
);

// 2. Add Lighting
let ambientLight = new THREE.AmbientLight(0xffffff, PULSE_MIN_INTENSITY); 
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 13);
directionalLight.position.set(5, 100, 20.5);
scene.add(directionalLight);


// 3. Load the Model
const loader = new GLTFLoader();

loader.load(
    'Synth Model/synth_model.glb',
    async function (gltf) { // <-- 1. MAKE THIS ASYNC
        modelToFadeIn = gltf.scene;
        modelToFadeIn.rotation.x = DEFAULT_ROTATION_X;
        modelToFadeIn.rotation.y = THREE.MathUtils.degToRad(45);
        modelToFadeIn.position.x = -5;
        modelToFadeIn.position.y = -5;

        // --- 2. AWAIT YOUR DISPLAY DATA ---
        await displayDataPromise; 

        // --- 3. MODIFY THE TRAVERSE LOGIC ---
        modelToFadeIn.traverse((child) => {
            if (child.isMesh && child.material) {
                
                // --- NEW: Handle Displays Separately ---
                if (child.name === 'Display01' || child.name === 'Display02') {
                    // Get text array from CSV, or provide a default 8-block array
                    const defaultArray = [["1-1", "1-2"], ["2-1", "2-2"], ["3-1", "3-2"], ["4-1", "4-2"], ["5-1", "5-2"], ["6-1", "6-2"], ["7-1", "7-2"], ["8-1", "8-2"]];
                    const textArray = displayData.get(child.name) || defaultArray;
                    const texture = createTextTexture(child.name, textArray); // <-- MODIFIED: Pass child.name

                    const processMaterial = (material) => {
                        material.map = texture;
                        material.emissiveMap = texture; // Make the text glow
                        material.emissive = new THREE.Color(0xffffff); // Glow full white
                        material.emissiveIntensity = 0.5; // Adjust glow brightness
                        material.toneMapped = false; // Makes the glow pop more (unaffected by film pass tone mapping)
                        
                        // Set opacity for fade-in
                        material.transparent = true;
                        material.opacity = 0;
                        material.needsUpdate = true;
                    };
                    Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);

                } else {
                // --- END NEW ---
                
                    // Existing fade-in logic for all other parts
                    const processMaterial = (material) => {
                        material.transparent = true;
                        material.opacity = 0;
                        material.needsUpdate = true;
                    };
                    Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);
                
                } // <-- NEW else brace
            }
        });

        scene.add(modelToFadeIn);
        //isFadingIn = true; // Waits for start button
        console.log('Model loaded, starting fade-in and curved zoom-in!');
    },
    undefined,
    function (error) {
        console.error('An error happened while loading the model:', error);
    }
);

// 4. Angle the Camera (45 degrees looking down)
const angle = THREE.MathUtils.degToRad(75);

camera.position.x = 0;
camera.position.y = INITIAL_RADIUS * Math.sin(angle); // Set initial position
camera.position.z = INITIAL_RADIUS * Math.cos(angle); // Set initial position
camera.lookAt(0, 0, 0);

// 6. Setup Post-Processing (Effect Composer)
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// --- NEW: OutlinePass for hover effect ---
outlinePass = new OutlinePass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    scene, 
    camera
);
outlinePass.edgeStrength = 3.0;
outlinePass.edgeGlow = 0.5;   
outlinePass.edgeThickness = 1.0;
outlinePass.visibleEdgeColor.set('#70bdc0'); // User's new color
outlinePass.hiddenEdgeColor.set('#110011');
composer.addPass(outlinePass);

// FilmPass for grain/noise effect
const filmPass = new FilmPass(
    0.35, 0.025, 648, false
);
filmPass.renderToScreen = true;
composer.addPass(filmPass);

// --- MODIFIED: Mouse Move Handler for Raycasting ---
function onMouseMove(event) {
    // This function is now ONLY for raycasting
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
window.addEventListener('mousemove', onMouseMove, false);

// --- Mobile Touch Handlers ---
function onTouchStart(event) {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        
        // 1. Update mouse for raycasting (for tap-to-select)
        mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        
        // 2. Start drag logic
        onDragStart(event);
    }
}
function onTouchMove(event) {
    if (event.touches.length === 1) { 
        // 1. Run drag logic
        onDragMove(event);
        
        // 2. Do NOT update raycaster, we are dragging
        mouse.x = -Infinity;
        mouse.y = -Infinity;
    }
}
function onTouchEnd(event) {
    // 1. Stop drag logic
    onDragEnd();
    
    // 2. Set mouse off-screen to lock selection
    mouse.x = -Infinity; 
    mouse.y = -Infinity;
}

window.addEventListener('touchstart', onTouchStart, false);
window.addEventListener('touchmove', onTouchMove, false);
window.addEventListener('touchend', onTouchEnd, false);

// --- Model Rotation / Drag Logic ---
function onDragStart(event) {
    isDragging = true;
    rotationVelocityY = 0;
    
    // --- NEW: Hide GUI on drag start ---
    hideGuiDisplayCanvas(); 
    if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
    currentDescriptionText = "";
    // --- END NEW ---

    // Snap back to default flat rotation when click starts
    if (modelToFadeIn) {
        modelToFadeIn.rotation.x = DEFAULT_ROTATION_X;
        modelToFadeIn.rotation.z = 0; // Reset any z-axis float
    }

    // Get initial position
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;
    
    previousMousePosition.x = clientX;
    previousMousePosition.y = clientY;
}
function onDragMove(event) {
    if (!isDragging || !modelToFadeIn) return;
    
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;

    // Calculate delta
    const deltaX = clientX - previousMousePosition.x;
    //const deltaY = clientY - previousMousePosition.y;
    rotationVelocityY = deltaX * DRAG_SENSITIVITY;
    // Apply rotation to the model
    // Apply the rotation to make it stick to the mouse
    modelToFadeIn.rotation.y += rotationVelocityY;
    //modelToFadeIn.rotation.x += deltaY * 0.001;

    // Store new position
    previousMousePosition.x = clientX;
    previousMousePosition.y = clientY;
}
function onDragEnd() {
    isDragging = false;
}

// Add mouse drag listeners to the canvas
renderer.domElement.addEventListener('mousedown', onDragStart, false);
renderer.domElement.addEventListener('mousemove', onDragMove, false);
renderer.domElement.addEventListener('mouseup', onDragEnd, false);
renderer.domElement.addEventListener('mouseleave', onDragEnd, false);

// --- Mouse Wheel Zoom Logic ---
function onMouseWheel(event) {
    event.preventDefault(); // Stop page from scrolling

    // Adjust currentRadius based on wheel delta
    // You can adjust 0.05 sensitivity
    currentRadius += event.deltaY * 0.05;

    // Clamp the radius to the min/max limits
    currentRadius = Math.max(MIN_ZOOM_RADIUS, Math.min(MAX_ZOOM_RADIUS, currentRadius));
}
renderer.domElement.addEventListener('wheel', onMouseWheel, false);

function checkIntersections() {
    // Don't raycast if dragging
    if (isDragging) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(modelToFadeIn, true); 

    let hoveredInteractive = null; 

    if (intersects.length > 0) {
        let objectToCheck = intersects[0].object;
        while (objectToCheck) {
            if (objectToCheck.name) {
                // Check for Knobs or Displays
                if (objectToCheck.name.includes('Knob') || objectToCheck.name === 'Display01' || objectToCheck.name === 'Display02') {
                    hoveredInteractive = objectToCheck; // Found an object
                    break;
                }
            }
            objectToCheck = objectToCheck.parent;
        }
    }

    // --- NEW STICKY LOGIC FOR ALL GUI ---
    if (hoveredInteractive && hoveredInteractive !== selectedObject) {
        selectedObject = hoveredInteractive;
        outlinePass.selectedObjects = [selectedObject];
        
        // Now, decide which GUI to show
        if (selectedObject.name.includes('Knob')) {
            // --- It's a Knob ---
            hideGuiDisplayCanvas(); // Hide display GUI
            
            // Show knob description
            const objectName = selectedObject.name;
            const description = knobDescriptions.get(objectName);
            
            if (description && description !== currentDescriptionText) {
                if (descriptionDisplayElement) {
                    descriptionDisplayElement.style.display = 'block'; // <-- CORRECTED
                    descriptionDisplayElement.innerHTML = description;
                    currentDescriptionText = description; 
                    descriptionDisplayElement.style.transform = 'scale(1.1)'; 

                    setTimeout(() => {
                        if (descriptionDisplayElement) {
                            descriptionDisplayElement.style.transform = 'scale(1)'; 
                        }
                    }, 150); 
                }
            }

        } else if (selectedObject.name === 'Display01') {
            // --- It's Display01 ---
            if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none'; // <-- CORRECTED
            currentDescriptionText = "";
            showGuiDisplayCanvas('Display01'); // Show display GUI

        } else if (selectedObject.name === 'Display02') {
            // --- It's Display02 ---
            if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none'; // <-- CORRECTED
            currentDescriptionText = "";
            showGuiDisplayCanvas('Display02'); // Show display GUI
        }
    }
    
    // --- REMOVED old non-sticky display logic ---
}
// ---------------------------------------------

// --- GUI DISPLAY CANVAS HELPER FUNCTIONS ---
function showGuiDisplayCanvas(displayName) {
    hideGuiDisplayCanvas(); // Hide previous first

    let canvasToShow = null;
    if (displayName === 'Display01') {
        canvasToShow = displayCanvas01;
    } else if (displayName === 'Display02') {
        canvasToShow = displayCanvas02;
    }

    if (canvasToShow && guiDisplayHost) {
        // Append the actual canvas element to the host div
        guiDisplayHost.appendChild(canvasToShow);
        guiDisplayHost.classList.add('visible');
    }
}
function hideGuiDisplayCanvas() {
    if (guiDisplayHost) {
        guiDisplayHost.classList.remove('visible');
        // Remove any canvas inside
        while (guiDisplayHost.firstChild) {
            guiDisplayHost.removeChild(guiDisplayHost.firstChild);
        }
    }
}
// 7. Animation Loop (Render the Scene)
function animate() {
    requestAnimationFrame(animate);

    // --- PULSE LOGIC ---
    const elapsedTime = clock.getElapsedTime(); 
    const pulseFactor = Math.sin(elapsedTime * PULSE_SPEED) * 0.5 + 0.5; 
    const newIntensity = PULSE_MIN_INTENSITY + (PULSE_MAX_INTENSITY - PULSE_MIN_INTENSITY) * pulseFactor;
    ambientLight.intensity = newIntensity;
    // --- END PULSE LOGIC ---

    // --- FADE-IN & CURVED ZOOM-IN LOGIC ---
    if (isFadingIn && modelToFadeIn) {
        let allMaterialsOpaque = true;

    // Make the model gently bob when not being dragged
    if (modelToFadeIn && !isDragging) {
        // You can adjust 0.5/0.3 to change float speed
        // You can adjust 0.03 to change the float amount
        modelToFadeIn.rotation.x = DEFAULT_ROTATION_X + (Math.sin(elapsedTime * 0.5) * 0.03); 
        modelToFadeIn.rotation.z = Math.sin(elapsedTime * 0.3) * 0.01;
    }

        // 1. FADE-IN
        modelToFadeIn.traverse((child) => {
            if (child.isMesh && child.material) {
                const processMaterial = (material) => {
                    if (material.opacity < 1) {
                        material.opacity += FADE_SPEED;
                        if (material.opacity >= 1) {
                            material.opacity = 1;
                        }
                        allMaterialsOpaque = false;
                    }
                };
                Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);
            }
        });
        
        // 2. CURVED ZOOM-IN (Intro anim)
        if (currentRadius > FINAL_RADIUS) {
            const distanceRemaining = currentRadius - FINAL_RADIUS;
            const zoomStep = distanceRemaining * EASE_FACTOR;
            currentRadius -= zoomStep;
            if (distanceRemaining < 0.01) { 
                currentRadius = FINAL_RADIUS; 
            }
            allMaterialsOpaque = false; 
            if (allMaterialsOpaque) {
                isFadingIn = false;
                console.log('Intro sequence complete.');
            }
        }
    }
    // --- END FADE-IN & CURVED ZOOM-IN LOGIC ---
    
if (!isDragging && modelToFadeIn && rotationVelocityY !== 0) {
        
        // Apply the drift rotation
        modelToFadeIn.rotation.y += rotationVelocityY;

        // Apply damping (friction)
        rotationVelocityY *= INERTIA_DAMPING;

        // Stop if velocity is negligible to prevent infinite loops
        if (Math.abs(rotationVelocityY) < 0.0001) {
            rotationVelocityY = 0;
        }
    }

    // --- NEW: Update camera position every frame based on radius ---
    // This works for both the intro anim and the user wheel zoom
    camera.position.y = currentRadius * Math.sin(angle);
    camera.position.z = currentRadius * Math.cos(angle);
    camera.lookAt(0, 0, 0); // Keep camera pointed at the center
    // --- END NEW ---

    // --- Call Raycasting Logic ---
    if (modelToFadeIn) {
        checkIntersections();
    }
    // -----------------------------

    // --- REMOVED: controls.update() ---

    // Render via the EffectComposer
    composer.render();
}

// --- Get Display Element from DOM ---
descriptionDisplayElement = document.getElementById('description-display');

// ---  Get GUI Display Host from DOM ---
guiDisplayHost = document.getElementById('gui-display-host');

// --- Fullscreen & Landscape Lock Logic ---
const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');

async function startExperience() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
        await document.documentElement.requestFullscreen();
        if (isMobile /*&& screen.orientation && screen.orientation.lock*/) {
            await screen.orientation.lock("landscape");
        }
    } catch (error) {
        console.warn("Could not enter fullscreen or lock orientation:", error);
    } finally {
        startOverlay.style.display = 'none';
        isFadingIn = true; 
    }
}

startButton.addEventListener('click', startExperience);
animate();

// 8. Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); 
    outlinePass.resolution.set(window.innerWidth, window.innerHeight);
});