import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// --- REMOVED: MapControls import ---
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
;

// --- RAYCASTING & OUTLINE VARIABLES ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedKnob = null; 
let outlinePass;
// --- END RAYCASTING & OUTLINE VARIABLES ---

// --- NEW: DRAG & ROTATION VARIABLES ---
let isDragging = false;
const previousMousePosition = {
    x: 0,
    y: 0
    };
    let rotationVelocityY = 0; // <-- ADD: Stores the current spin speed
    const INERTIA_DAMPING = 0.97; // <-- ADD: Friction (0.9 = fast stop, 0.99 = long drift)
    const DRAG_SENSITIVITY = 0.005; // <-- ADD: Your existing sensitivity as a constant

// --- END NEW ---

// --- MODIFIED: DISPLAY & DATA VARIABLES ---
let descriptionDisplayElement; 
let currentDescriptionText = ""; 
let knobDescriptions = new Map();
// --- END MODIFIED ---

// --- NEW: CSV DATA LOADING ---
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
loadKnobData();
// --- END NEW ---

// --- PULSE VARIABLES ---
let clock = new THREE.Clock();
const PULSE_MIN_INTENSITY = 8; 
const PULSE_MAX_INTENSITY = 8.5; 
const PULSE_SPEED = 2; 
// --- END PULSE VARIABLES ---

// --- FADE-IN & ZOOM-IN VARIABLES ---
let modelToFadeIn; 
const FADE_SPEED = 0.0025; 
let isFadingIn = false;

// Zoom-in variables
const INITIAL_RADIUS = 70;
const FINAL_RADIUS = 40; 
// --- NEW: Zoom limits (were in MapControls) ---
const MIN_ZOOM_RADIUS = 40;
const MAX_ZOOM_RADIUS = 70;
// --- END NEW ---
const EASE_FACTOR = 0.02; 
const DEFAULT_ROTATION_X = THREE.MathUtils.degToRad(330);
let currentRadius = INITIAL_RADIUS;
// --- END FADE-IN & ZOOM-IN VARIABLES ---

// 1. Setup the Scene, Camera, and Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antiaslias: true });

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
        scene.environment = texture; // Set environment for reflections
    },
    undefined,
    function(error) {
        console.error('An error happened while loading the background texture:', error);
        scene.background = new THREE.Color(0xcccccc);
    }
);
// --- END BACKGROUND TEXTURE LOADING ---


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
    function (gltf) {
        modelToFadeIn = gltf.scene;
        modelToFadeIn.rotation.x = DEFAULT_ROTATION_X;
        modelToFadeIn.rotation.y = THREE.MathUtils.degToRad(45);
        modelToFadeIn.position.x = -5; 
        modelToFadeIn.position.y = -5; 
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


// 5. Initialize MapControls (with adjusted bounds)
// --- REMOVED ALL MAPCONTROLS CODE ---


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
// -----------------------------------------

// FilmPass for grain/noise effect
const filmPass = new FilmPass(
    0.35, 0.025, 648, false
);
filmPass.renderToScreen = true;
composer.addPass(filmPass);


// --- MODIFIED: Mouse Move Handler for Raycasting ONLY ---
function onMouseMove(event) {
    // This function is now ONLY for raycasting
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
window.addEventListener('mousemove', onMouseMove, false);
// ----------------------------------------------

// --- MODIFIED: Mobile Touch Handlers ---
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
// --- END MODIFIED ---

// --- NEW: Model Rotation / Drag Logic ---
function onDragStart(event) {
    isDragging = true;
    rotationVelocityY = 0;
    
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
// --- END NEW ---

// --- NEW: Mouse Wheel Zoom Logic ---
function onMouseWheel(event) {
    event.preventDefault(); // Stop page from scrolling

    // Adjust currentRadius based on wheel delta
    // You can adjust 0.05 sensitivity
    currentRadius += event.deltaY * 0.05;

    // Clamp the radius to the min/max limits
    currentRadius = Math.max(MIN_ZOOM_RADIUS, Math.min(MAX_ZOOM_RADIUS, currentRadius));
}

renderer.domElement.addEventListener('wheel', onMouseWheel, false);
// --- END NEW ---


// --- MODIFIED: Raycasting Logic for Sticky Outline & Display ---
function checkIntersections() {
    // --- NEW: Don't check for knobs while dragging ---
    if (isDragging) return;
    // --- END NEW ---

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(modelToFadeIn, true); 

    let currentlyHoveredKnob = null;
    if (intersects.length > 0) {
        let objectToCheck = intersects[0].object;
        while (objectToCheck) {
            if (objectToCheck.name && objectToCheck.name.includes('Knob')) {
                currentlyHoveredKnob = objectToCheck;
                break; 
            }
            objectToCheck = objectToCheck.parent;
        }
    }

    if (currentlyHoveredKnob && currentlyHoveredKnob !== selectedKnob) {
        selectedKnob = currentlyHoveredKnob; 
        outlinePass.selectedObjects = [selectedKnob];
        
        const objectName = selectedKnob.name;
        const description = knobDescriptions.get(objectName);
        
        if (description && description !== currentDescriptionText) {
            if (descriptionDisplayElement) {
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
}
// ---------------------------------------------


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

// --- MODIFIED: Get Display Element from DOM ---
descriptionDisplayElement = document.getElementById('description-display');

// --- NEW: Fullscreen & Landscape Lock Logic ---
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