import * as THREE from 'three';

/**
 * Picks a random color from the gradient between two colors.
 * @param {THREE.Color} color1 - The starting color.
 * @param {THREE.Color} color2 - The ending color.
 * @returns {THREE.Color} A new THREE.Color object.
 */
function getRandomColorBetween(color1, color2) {
    // 1. Get a random "alpha" value (a float between 0.0 and 1.0)
    const alpha = Math.random();
    
    // 2. Create a new color to store the result
    const randomColor = new THREE.Color();
    
    // 3. Linearly interpolate between the two colors using the random alpha
    randomColor.lerpColors(color1, color2, alpha);
    
    return randomColor;
}

export { getRandomColorBetween };
