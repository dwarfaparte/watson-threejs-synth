import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
// --- NEW IMPORT for Outline Effect ---
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
;

// --- RAYCASTING & OUTLINE VARIABLES ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectedObject = null; // To track the currently highlighted object
let outlinePass; // Declare globally so it can be accessed in animate() and resize handler
// --- END RAYCASTING & OUTLINE VARIABLES ---

// --- NEW: TOOLTIP & DATA VARIABLES ---
let tooltipElement; // Will hold the HTML <div>
let knobDescriptions = new Map(); // To store 'Knob.001' -> 'This is knob one.'
// --- END NEW ---

// --- NEW: CSV DATA LOADING ---
async function loadKnobData() {
    try {
        // *** REPLACE with the actual path to your CSV file ***
        const response = await fetch('tooltips.csv');
        const data = await response.text();

        // Parse the CSV data
        const lines = data.split('\n'); // Split into rows

        // Skip the header row (if you have one) by starting i at 1
        // If you have no header row, start i at 0
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                // Find the first comma to split key and value
                const commaIndex = line.indexOf(',');
                if (commaIndex !== -1) {
                    const name = line.substring(0, commaIndex).trim();
                    // Get the rest of the line as the description
                    const description = line.substring(commaIndex + 1).trim()
                                           // Remove quotes if they exist
                                          .replace(/^"|"$/g, ''); 
                    
                    knobDescriptions.set(name, description);
                }
            }
        }
        console.log('Knob descriptions loaded:', knobDescriptions);

    } catch (error) {
        console.error('Error loading CSV data:', error);
    }
}
loadKnobData(); // Call the function to load the data
// --- END NEW ---

// --- PULSE VARIABLES ---
let clock = new THREE.Clock();
const PULSE_MIN_INTENSITY = 5; // Minimum brightness for ambient light
const PULSE_MAX_INTENSITY = 5.5; // Maximum brightness
const PULSE_SPEED = 2; // Controls the speed of the pulse
// --- END PULSE VARIABLES ---

// --- FADE-IN & ZOOM-IN VARIABLES ---
let modelToFadeIn; // Will store the loaded GLTF scene
const FADE_SPEED = 0.0025; // How fast the model fades in (per frame)
let isFadingIn = false;

// Zoom-in variables
const INITIAL_RADIUS = 70;
const FINAL_RADIUS = 40; // The camera's final distance from the center
const EASE_FACTOR = 0.02; // Controls the curve: a smaller number means a slower, smoother stop.
let currentRadius = INITIAL_RADIUS;
// --- END FADE-IN & ZOOM-IN VARIABLES ---

// 1. Setup the Scene, Camera, and Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- BACKGROUND TEXTURE LOADING ---
const textureLoader = new THREE.TextureLoader();
const backgroundPath = 'Synth Model/skybox_bright.jpg';


textureLoader.load(
    backgroundPath,
    function(texture) {
        scene.background = texture;
        texture.mapping = THREE.EquirectangularReflectionMapping;
    },
    undefined,
    function(error) {
        console.error('An error happened while loading the background texture:', error);
        scene.background = new THREE.Color(0xcccccc);
    }
);
// --- END BACKGROUND TEXTURE LOADING ---


// 2. Add Lighting
// Ambient light is declared with 'let' so its intensity can be modified in the loop
let ambientLight = new THREE.AmbientLight(0xffffff, PULSE_MIN_INTENSITY); 
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 15);
directionalLight.position.set(5, 10, 20.5);
scene.add(directionalLight);


// 3. Load the Model
const loader = new GLTFLoader();

loader.load(
    'Synth Model/synth_model.glb',
    function (gltf) {
        modelToFadeIn = gltf.scene;
        modelToFadeIn.rotation.x = THREE.MathUtils.degToRad(350);
        modelToFadeIn.rotation.y = THREE.MathUtils.degToRad(45);
        modelToFadeIn.traverse((child) => {
            if (child.isMesh && child.material) {
                const processMaterial = (material) => {
                    material.transparent = true;
                    material.opacity = 0;
                    material.needsUpdate = true;
                };
                Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);
            }
        });

        scene.add(modelToFadeIn);
        //isFadingIn = true; // Start both fade-in and zoom-in
        console.log('Model loaded, starting fade-in and curved zoom-in!');
    },
    undefined,
    function (error) {
        console.error('An error happened while loading the model:', error);
    }
);


// 4. Angle the Camera (45 degrees looking down)
// Use the INITIAL_RADIUS for the initial camera setup
const angle = THREE.MathUtils.degToRad(75);

camera.position.x = 0;
camera.position.y = 0//INITIAL_RADIUS * Math.sin(angle);
camera.position.z = 0//INITIAL_RADIUS * Math.cos(angle);
camera.lookAt(0, 0, 0);


// 5. Initialize MapControls (with adjusted bounds)
const controls = new MapControls(camera, renderer.domElement);

controls.enableKeys = true; // Enables WASD/Arrow Keys for horizontal movement
controls.enableZoom = true; // Enables mouse wheel zoom
controls.enablePan = false//
controls.keyPanSpeed = 1000; // Increase this value (e.g., 100) to make WASD movement noticeable

// ---  SET ZOOM LIMITS ---
controls.minDistance = 40; // How close the user can zoom in
controls.maxDistance = 70; // How far the user can zoom out

// Tweak the bounds to allow a slightly wider vertical angle
const NEW_MIN_ANGLE = THREE.MathUtils.degToRad(0); // Steeper than 45
const NEW_MAX_ANGLE = THREE.MathUtils.degToRad(80); // Flatter than 90

// --- LOCK VERTICAL ROTATION ---
const LOCK_ANGLE = THREE.MathUtils.degToRad(35); // 15 degrees from North Pole (straight down) is 75 degrees from the XZ plane.

controls.minPolarAngle = LOCK_ANGLE; 
controls.maxPolarAngle = LOCK_ANGLE;
//controls.minAzimuthAngle = NEW_MIN_ANGLE
//controls.maxAzimuthAngle = NEW_MAX_ANGLE


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
outlinePass.edgeStrength = 3.0; // How thick the outline is
outlinePass.edgeGlow = 0.5;    // How much glow is around the outline
outlinePass.edgeThickness = 1.0;
outlinePass.visibleEdgeColor.set('#48f9ffff'); // Neon Magenta
outlinePass.hiddenEdgeColor.set('#110011');
composer.addPass(outlinePass);
// -----------------------------------------

// FilmPass for grain/noise effect
const filmPass = new FilmPass(
    0.35,  // intensity of noise (grain)
    0.025, // scanline intensity
    648,   // scanline count
    false  // grayscale
);
filmPass.renderToScreen = true;
composer.addPass(filmPass);


// --- MODIFIED: Mouse Move Handler for Raycasting AND Tooltip ---
function onMouseMove(event) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // --- NEW: Update Tooltip Position ---
    // Update the tooltip's position to follow the mouse cursor
    // Add a small offset (e.g., 10px) so the cursor isn't on top of it
    if (tooltipElement) {
        tooltipElement.style.left = (event.clientX + 10) + 'px';
        tooltipElement.style.top = (event.clientY + 10) + 'px';
    }
    // --- END NEW ---
}
window.addEventListener('mousemove', onMouseMove, false);
// ----------------------------------------------

// --- MODIFIED: Raycasting Logic for Outlining & Tooltip ---
function checkIntersections() {
    // 1. Raycast from camera through the mouse position
    raycaster.setFromCamera(mouse, camera);

    // Check intersections against the whole model (recursive: true)
    const intersects = raycaster.intersectObject(modelToFadeIn, true); 

    // 2. Clear previous outline
    if (intersectedObject) {
        outlinePass.selectedObjects = [];
        intersectedObject = null;
    }

    // --- NEW: Hide tooltip by default each frame ---
    // It will be re-shown if a new knob is found
if (tooltipElement) {
        tooltipElement.style.opacity = '0';
        tooltipElement.style.visibility = 'hidden';
    }
    // 3. Check for new intersection and filter for objects containing "Knob" in their name
    if (intersects.length > 0) {
        // The intersected object might be a sub-mesh. Traverse up to find the parent object named 'Knob'.
        let objectToOutline = intersects[0].object;

        // Traverse up the hierarchy until we find the parent with "Knob" in its name
        // This is necessary because the mesh itself might have a generic name
        while (objectToOutline) {
            if (objectToOutline.name && objectToOutline.name.includes('Knob')) {
                intersectedObject = objectToOutline;
                // outlinePass expects an array of objects to outline
                outlinePass.selectedObjects = [intersectedObject];
                
                const objectName = intersectedObject.name;
                const description = knobDescriptions.get(objectName);
                console.log(`Hovering over: [${objectName}], Description found: [${description}]`);

                // --- NEW: Show Tooltip ---
                if (tooltipElement) {
                    // Look up the description from our loaded data
                    const description = knobDescriptions.get(intersectedObject.name);
                    
                if (description) {
                        tooltipElement.innerHTML = description;
                        tooltipElement.style.opacity = '1';
                        tooltipElement.style.visibility = 'visible';
                    }
                }
                // --- END NEW ---
                
                break; // Stop climbing once the named knob is found
            }
            objectToOutline = objectToOutline.parent;
        }
    }
}
// ---------------------------------------------


// 7. Animation Loop (Render the Scene)
function animate() {
    requestAnimationFrame(animate);

    // --- PULSE LOGIC ---
    const elapsedTime = clock.getElapsedTime(); 
    
    // Normalizes sin wave to 0.0 to 1.0
    const pulseFactor = Math.sin(elapsedTime * PULSE_SPEED) * 0.5 + 0.5; 

    // Map the 0-to-1 factor to the desired intensity range
    const newIntensity = PULSE_MIN_INTENSITY + (PULSE_MAX_INTENSITY - PULSE_MIN_INTENSITY) * pulseFactor;

    ambientLight.intensity = newIntensity;
    // --- END PULSE LOGIC ---

    // --- FADE-IN & CURVED ZOOM-IN LOGIC ---
    if (isFadingIn && modelToFadeIn) {
        let allMaterialsOpaque = true;

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
        
        // 2. CURVED ZOOM-IN
        if (currentRadius > FINAL_RADIUS) {
            
            // Calculate the distance remaining to the final position
            const distanceRemaining = currentRadius - FINAL_RADIUS;
            
            // Calculate a curved step: large at first, small as it gets closer
            const zoomStep = distanceRemaining * EASE_FACTOR;
            
            // Apply the step
            currentRadius -= zoomStep;

            // Check if the camera is close enough to stop (to prevent jitter from easing)
            if (distanceRemaining < 0.01) { 
                currentRadius = FINAL_RADIUS; // Snap to the final position
            }
            
            // Re-calculate the camera position based on the new, smaller radius
            camera.position.y = currentRadius * Math.sin(angle);
            camera.position.z = currentRadius * Math.cos(angle);
            
            // If the zoom-in is still running, the sequence isn't complete
            allMaterialsOpaque = false; 

            if (allMaterialsOpaque) {
            isFadingIn = false; // Stop this entire intro block from running again
            console.log('Intro sequence complete.');
            }
        }
    }
    // --- END FADE-IN & CURVED ZOOM-IN LOGIC ---
    
    // --- NEW: Call Raycasting Logic ---
    if (modelToFadeIn) {
        checkIntersections();
    }
    // ---------------------------------

    // Update the controls' target/position
    controls.update(); 

    // Render via the EffectComposer
    composer.render();
}

// --- NEW: Get Tooltip Element from DOM ---
tooltipElement = document.getElementById('tooltip');

// --- NEW: Fullscreen & Landscape Lock Logic ---
const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');

async function startExperience() {
    // Check if the Screen Orientation API is available
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
        // 1. Request Fullscreen
        // This is required for orientation lock on most browsers
        await document.documentElement.requestFullscreen();

        // 2. Lock Orientation (only attempt on mobile)
        if (isMobile /*&& screen.orientation && screen.orientation.lock*/) {
            await screen.orientation.lock("landscape");
        }

    } catch (error) {
        console.warn("Could not enter fullscreen or lock orientation:", error);
    } finally {
        // 3. Hide the overlay regardless of success
        startOverlay.style.display = 'none';
        
        // --- NEW LINE ---
        // 4. Start the fade-in and zoom-in animation
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
    
    // --- NEW: Update OutlinePass resolution on resize ---
    outlinePass.resolution.set(window.innerWidth, window.innerHeight);
    // ----------------------------------------------------
});