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

// --- DISPLAY TEXT LOADING ---
let displayData = new Map();
let displayDataPromise; // To await this in the loader

// --- REMOVED: GUI DISPLAY CANVAS VARIABLES ---

// --- CSV DATA LOADING (Only for Knobs) ---
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

// --- NEW: loadDisplayData function restored ---
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

// --- NEW: createTextTexture function restored ---
/**
 * Creates a THREE.CanvasTexture with a 4x2 grid of text, with 2 lines per block.
 * @param {string} displayName - The name of the display ("Display01" or "Display02")
 * @param {string[][]} textArray - An array of 8 arrays, each containing 2 strings.
 * @param {number} [width=512] - Canvas width.
 * @param {number} [height=128] - Canvas height.
 * @returns {THREE.CanvasTexture}
 */
function createTextTexture(displayName, textArray, width = 512, height = 128) {
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

    // --- REMOVED: Save canvas to global variable ---

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Improves quality
    
    return texture;
}


// Start loading knob data
loadKnobData();
// --- NEW: displayDataPromise restored --- 
displayDataPromise = loadDisplayData(); 

// --- PULSE VARIABLES ---
let clock = new THREE.Clock();
const PULSE_MIN_INTENSITY = 8; 
const PULSE_MAX_INTENSITY = 8.5; 
const PULSE_SPEED = 2; 

// --- FADE-IN & ZOOM-IN VARIABLES ---
let modelToFadeIn; 
let isFadingIn = false; // intro sequence is running

// Zoom-in variables
const INITIAL_RADIUS = 70;
const FINAL_RADIUS = 40; 
const MIN_ZOOM_RADIUS = 10;
const MAX_ZOOM_RADIUS = 70;

const EASE_FACTOR = 0.02; 
const DEFAULT_ROTATION_X = THREE.MathUtils.degToRad(330);
let currentRadius = INITIAL_RADIUS;

// --- CAMERA FOCUS VARIABLES ---
let isCameraFocused = false; // Is the camera in a zoomed-in, focused state?
let isCameraTransitioning = false; // Is the camera currently transitioning?
let targetCameraPosition = new THREE.Vector3(); // Where the camera should move to
let targetLookAt = new THREE.Vector3(0, 0, 0); // Where the camera should look
let lerpedLookAt = new THREE.Vector3(0, 0, 0); // For smooth lookAt transitions
let targetCameraUp = new THREE.Vector3(0, 1, 0); // <-- NEW: Camera's "up" vector
let lerpedCameraUp = new THREE.Vector3(0, 1, 0); // <-- NEW: Smoothed "up" vector
const CAMERA_FOCUS_SPEED = 0.05; // Speed for smooth transition (0 to 1)

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
                    const texture = createTextTexture(child.name, textArray); 

                    const processMaterial = (material) => {
                        material.map = texture;
                        material.emissiveMap = texture; // Make the text glow
                        material.emissive = new THREE.Color(0xffffff); // Glow full white
                        material.emissiveIntensity = 0.5; // Adjust glow brightness
                        material.toneMapped = false; // Makes the glow pop more (unaffected by film pass tone mapping)
                        
                        // --- REMOVED opacity/transparent lines ---
                        material.needsUpdate = true;
                    };
                    Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);

                } 
                // --- REMOVED else block that made other parts transparent ---
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

// --- OutlinePass for hover effect ---
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
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
window.addEventListener('mousemove', onMouseMove, false);

// --- Mouse Click Handler for Interaction ---
function onMouseClick(event) {
    // Don't register a click if we are dragging
    if (isDragging || isCameraTransitioning) return;

    // Set mouse position for raycaster
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Check intersections immediately on click
    checkIntersections(true); // <-- Pass 'true' to indicate a click action
}

renderer.domElement.addEventListener('click', onMouseClick, false);

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
    
    // --- Reset camera focus on drag ---
    if (isCameraFocused) {
        isCameraFocused = false;
        isCameraTransitioning = true;
        // The animate loop will handle lerping back
    }
     
    // ---  Hide knob GUI on drag start ---
    // REMOVED: hideGuiDisplayCanvas(); 
    if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
    currentDescriptionText = "";

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

function checkIntersections(isClick = false) { 
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

    if (isClick && hoveredInteractive && (hoveredInteractive.name === 'Display01' || hoveredInteractive.name === 'Display02')) {
        isCameraFocused = true;
        isCameraTransitioning = true;
        
        // --- Dynamic, Rotation-Aware Position Calculation ---
        
        // 1. Get the world position of the display (this is our lookAt target)
        hoveredInteractive.getWorldPosition(targetLookAt);
        
        // 2. Get the display's local axes in world space.
        const displayUp = new THREE.Vector3();
        const displayNormal = new THREE.Vector3(); // This is the vector pointing OUT of the screen
        
        // Make sure the object's matrix is updated
        hoveredInteractive.updateWorldMatrix(true, false); 
        
        displayNormal.setFromMatrixColumn(hoveredInteractive.matrixWorld, 1); 
        displayUp.setFromMatrixColumn(hoveredInteractive.matrixWorld, 2);
        displayUp.negate();

        // 3. Set the target camera "up" vector. This fixes the Z-axis roll.
        targetCameraUp.copy(displayUp).normalize();

        // 4. Set the target camera position.
        displayNormal.multiplyScalar(8); 
        targetCameraPosition.copy(targetLookAt).add(displayNormal);
        // --- END MODIFIED ---
        
        // Hide any GUI that might be open
        // REMOVED: hideGuiDisplayCanvas();
        if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
        currentDescriptionText = "";
        
        // Deselect object so outline goes away
        selectedObject = null;
        outlinePass.selectedObjects = [];
        return; // Stop processing, we've handled the click
    }

    // --- STICKY LOGIC FOR ALL GUI ---
    if (hoveredInteractive && hoveredInteractive !== selectedObject) {
        selectedObject = hoveredInteractive;
        outlinePass.selectedObjects = [selectedObject];
        
        // Now, decide which GUI to show
        if (selectedObject.name.includes('Knob')) {
            // --- It's a Knob ---
            // REMOVED: hideGuiDisplayCanvas(); // Hide display GUI
            
            // Show knob description
            const objectName = selectedObject.name;
            const description = knobDescriptions.get(objectName);
            
            if (description && description !== currentDescriptionText) {
                if (descriptionDisplayElement) {
                    descriptionDisplayElement.style.display = 'block'; 
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
        }
    } else if (!hoveredInteractive && selectedObject) { 
        // Mouse is on no object, but an object is still selected
        selectedObject = null;
        outlinePass.selectedObjects = [];
        
        // Hide all GUIs
        if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
        currentDescriptionText = "";
    }
}

// --- REMOVED: GUI DISPLAY CANVAS HELPER FUNCTIONS ---
// 7. Animation Loop (Render the Scene)
function animate() {
    requestAnimationFrame(animate);

    // --- PULSE LOGIC ---
    const elapsedTime = clock.getElapsedTime(); 
    const pulseFactor = Math.sin(elapsedTime * PULSE_SPEED) * 0.5 + 0.5; 
    const newIntensity = PULSE_MIN_INTENSITY + (PULSE_MAX_INTENSITY - PULSE_MIN_INTENSITY) * pulseFactor;
    ambientLight.intensity = newIntensity;
    // --- END PULSE LOGIC ---

    // --- MODIFIED: INTRO ZOOM & BOBBING LOGIC ---
    if (isFadingIn && modelToFadeIn) {

        // --- Make the model gently bob... ---
        if (modelToFadeIn && !isDragging && !isCameraFocused) {
            // You can adjust 0.5/0.3 to change float speed
            // You can adjust 0.03 to change the float amount
            modelToFadeIn.rotation.x = DEFAULT_ROTATION_X + (Math.sin(elapsedTime * 0.5) * 0.03); 
            modelToFadeIn.rotation.z = Math.sin(elapsedTime * 0.3) * 0.01;
        
        } else if (modelToFadeIn) { 
            // When focused or dragging, smoothly return to default non-bobbing rotation
            modelToFadeIn.rotation.x = THREE.MathUtils.lerp(modelToFadeIn.rotation.x, DEFAULT_ROTATION_X, 0.1);
            modelToFadeIn.rotation.z = THREE.MathUtils.lerp(modelToFadeIn.rotation.z, 0, 0.1);
        }
        
        // 2. CURVED ZOOM-IN (Intro anim)
        if (currentRadius > FINAL_RADIUS) {
            const distanceRemaining = currentRadius - FINAL_RADIUS;
            const zoomStep = distanceRemaining * EASE_FACTOR;
            currentRadius -= zoomStep;
            if (distanceRemaining < 0.01) { 
                currentRadius = FINAL_RADIUS; 
                isFadingIn = false; // <-- Set flag to false HERE
                console.log('Intro sequence complete.');
            }
        } else {
             // Also handle case where we are already at or past the zoom
             isFadingIn = false;
        }
    }
    
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

    // --- Check if camera has arrived at its destination ---
    if (isCameraTransitioning) {
        const distanceToTarget = camera.position.distanceTo(targetCameraPosition);
        // If we are very close, stop the transition
        if (distanceToTarget < 0.01) {
            isCameraTransitioning = false;
            // Optional: Snap to final position to be precise
            camera.position.copy(targetCameraPosition);
            lerpedLookAt.copy(targetLookAt);
            lerpedCameraUp.copy(targetCameraUp);
        }
    }

   // --- Camera Position Logic
    if (isCameraFocused) {
        // Targets are set by checkIntersections on click
    } else {
        // We are in default mode. Set targets *every frame*
        // to account for wheel-based 'currentRadius' changes.
        targetCameraPosition.set(
            0,
            currentRadius * Math.sin(angle),
            currentRadius * Math.cos(angle)
        );
        targetLookAt.set(0, 0, 0);
        targetCameraUp.set(0, 1, 0); // Reset "up" vector to world default
    }
    
    // Always lerp to the current target position, lookAt point, and up vector
    camera.position.lerp(targetCameraPosition, CAMERA_FOCUS_SPEED);
    lerpedLookAt.lerp(targetLookAt, CAMERA_FOCUS_SPEED);
    lerpedCameraUp.lerp(targetCameraUp, CAMERA_FOCUS_SPEED); //
    
    // Apply the "up" vector *before* calling lookAt
    camera.up.copy(lerpedCameraUp); // 
    camera.lookAt(lerpedLookAt);
    // --- END REPLACED ---

    // --- Call Raycasting Logic ---
    if (modelToFadeIn) {
        checkIntersections(false); // <-- MODIFIED: Pass false for hover check
    }

    // Render via the EffectComposer
    composer.render();
}

// --- Get Display Element from DOM ---
descriptionDisplayElement = document.getElementById('description-display');

// --- Fullscreen & Landscape Lock Logic ---
const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');

// --- startExperience function ---
async function startExperience() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
        if (isMobile /*&& screen.orientation && screen.orientation.lock*/) {
            await document.documentElement.requestFullscreen();
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock("landscape");
            }
        }
    } catch (error) {
        console.warn("Could not enter fullscreen or lock orientation:", error);
    } finally {
        // Hide the start button overlay
        startOverlay.style.display = 'none';
        
        // Get the new fade overlay and trigger the fade-out
        const fadeOverlay = document.getElementById('fade-overlay');
        if (fadeOverlay) {
            fadeOverlay.style.opacity = '0';
        }
        
        // Start the zoom-in animation
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