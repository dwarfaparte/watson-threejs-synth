import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';

// --- PULSE VARIABLES ---
let clock = new THREE.Clock();
const PULSE_MIN_INTENSITY = 2; // Minimum brightness for ambient light
const PULSE_MAX_INTENSITY = 2.5; // Maximum brightness
const PULSE_SPEED = 2; // Controls the speed of the pulse
// --- END PULSE VARIABLES ---

// --- FADE-IN & ZOOM-IN VARIABLES ---
let modelToFadeIn; // Will store the loaded GLTF scene
const FADE_SPEED = 0.0025; // How fast the model fades in (per frame)
let isFadingIn = false;

// Zoom-in variables
const INITIAL_RADIUS = 15;
const FINAL_RADIUS = 12; // The camera's final distance from the center
const EASE_FACTOR = 0.02; // Controls the curve: a smaller number means a slower, smoother stop.
let currentRadius = INITIAL_RADIUS;
// --- END FADE-IN & ZOOM-IN VARIABLES ---

// 1. Setup the Scene, Camera, and Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- BACKGROUND TEXTURE LOADING ---
const textureLoader = new THREE.TextureLoader();
const backgroundPath = 'Synth Model/skybox.jpg';

textureLoader.load(
    backgroundPath,
    function(texture) {
        scene.background = texture;
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

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);


// 3. Load the Model
const loader = new GLTFLoader();

loader.load(
    'Synth Model/synth_model.glb',
    function (gltf) {
        modelToFadeIn = gltf.scene;
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
        isFadingIn = true; // Start both fade-in and zoom-in
        console.log('Model loaded, starting fade-in and curved zoom-in!');
    },
    undefined,
    function (error) {
        console.error('An error happened while loading the model:', error);
    }
);


// 4. Angle the Camera (45 degrees looking down)
// Use the INITIAL_RADIUS for the initial camera setup
const angle = THREE.MathUtils.degToRad(45);

camera.position.x = 0;
camera.position.y = INITIAL_RADIUS * Math.sin(angle);
camera.position.z = INITIAL_RADIUS * Math.cos(angle);
camera.lookAt(0, 0, 0);


// 5. Initialize MapControls (with adjusted bounds)
const controls = new MapControls(camera, renderer.domElement);

controls.enableKeys = true; // Enables WASD/Arrow Keys for horizontal movement
controls.enableZoom = true; // Enables mouse wheel zoom
controls.keyPanSpeed = 1000; // Increase this value (e.g., 100) to make WASD movement noticeable

// Tweak the bounds to allow a slightly wider vertical angle
const NEW_MIN_ANGLE = THREE.MathUtils.degToRad(15); // Steeper than 45
const NEW_MAX_ANGLE = THREE.MathUtils.degToRad(100); // Flatter than 90

controls.minPolarAngle = NEW_MIN_ANGLE; 
controls.maxPolarAngle = NEW_MAX_ANGLE;


// 6. Setup Post-Processing (Effect Composer)
const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// FilmPass for grain/noise effect
const filmPass = new FilmPass(
    0.35,  // intensity of noise (grain)
    0.025, // scanline intensity
    648,   // scanline count
    false  // grayscale
);
filmPass.renderToScreen = true;
composer.addPass(filmPass);


// 7. Animation Loop (Render the Scene)
function animate() {
    requestAnimationFrame(animate);

    // Only update controls after the zoom-in is complete
    if (!isFadingIn) {
        controls.update();
    }

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
            
            // Update the controls' target/position
            controls.update(); 

            // Prevent map controls from interfering during the automatic zoom
            controls.enabled = false; 

            // If the zoom-in is still running, the sequence isn't complete
            allMaterialsOpaque = false; 
        }

        if (allMaterialsOpaque) {
            isFadingIn = false; // Zoom and fade complete
            controls.enabled = true; // Re-enable user controls
        }
    }
    // --- END FADE-IN & CURVED ZOOM-IN LOGIC ---

    // Render via the EffectComposer
    composer.render();
}

animate();


// 8. Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); 
});