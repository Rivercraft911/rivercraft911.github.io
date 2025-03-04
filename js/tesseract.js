// Enhanced Tesseract Animation with 4D visualization and complex folding effects
// This script creates a more dynamic and interactive tesseract representation

function initTesseract() {
    try {
        console.log("Initializing enhanced tesseract with 4D visualization");
        
        const container = document.getElementById('tesseract-animation');
        if (!container) {
            console.error("Tesseract container not found");
            return;
        }
        
        // Create scene
        const scene = new THREE.Scene();
        
        // Create camera with wider field of view
        const camera = new THREE.PerspectiveCamera(85, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.z = 4;
        
        // Create renderer with better quality
        const renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true,
            precision: 'highp' 
        });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);
        
        // Create the outer cube
        const outerGeometry = new THREE.BoxGeometry(2.2, 2.2, 2.2);
        const outerEdges = new THREE.EdgesGeometry(outerGeometry);
        const outerMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });
        const outerCube = new THREE.LineSegments(outerEdges, outerMaterial);
        
        // Create the inner cube
        const innerGeometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
        const innerEdges = new THREE.EdgesGeometry(innerGeometry);
        const innerMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });
        const innerCube = new THREE.LineSegments(innerEdges, innerMaterial);
        
        // Create middle cube for additional complexity
        const middleGeometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
        const middleEdges = new THREE.EdgesGeometry(middleGeometry);
        const middleMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            linewidth: 1
        });
        const middleCube = new THREE.LineSegments(middleEdges, middleMaterial);
        
        // Create function to make connecting lines
        const createConnector = (p1, p2) => {
            const points = [];
            points.push(new THREE.Vector3(p1.x, p1.y, p1.z));
            points.push(new THREE.Vector3(p2.x, p2.y, p2.z));
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: 0x00ff00,
                transparent: true,
                opacity: 0.5,
                linewidth: 1
            });
            
            return new THREE.Line(geometry, material);
        };
        
        // Define vertices for outer cube
        const outerVertices = [
            { x: -1.1, y: -1.1, z: -1.1 },
            { x: 1.1, y: -1.1, z: -1.1 },
            { x: 1.1, y: 1.1, z: -1.1 },
            { x: -1.1, y: 1.1, z: -1.1 },
            { x: -1.1, y: -1.1, z: 1.1 },
            { x: 1.1, y: -1.1, z: 1.1 },
            { x: 1.1, y: 1.1, z: 1.1 },
            { x: -1.1, y: 1.1, z: 1.1 }
        ];
        
        // Define vertices for inner cube
        const innerVertices = [
            { x: -0.55, y: -0.55, z: -0.55 },
            { x: 0.55, y: -0.55, z: -0.55 },
            { x: 0.55, y: 0.55, z: -0.55 },
            { x: -0.55, y: 0.55, z: -0.55 },
            { x: -0.55, y: -0.55, z: 0.55 },
            { x: 0.55, y: -0.55, z: 0.55 },
            { x: 0.55, y: 0.55, z: 0.55 },
            { x: -0.55, y: 0.55, z: 0.55 }
        ];
        
        // Create connectors between vertices
        const connectors = [];
        for (let i = 0; i < 8; i++) {
            connectors.push(createConnector(outerVertices[i], innerVertices[i]));
        }
        
        // Create additional cross-connectors for more 4D effect
        const crossConnectors = [];
        
        // Connect some vertices diagonally between cubes
        crossConnectors.push(createConnector(outerVertices[0], innerVertices[7]));
        crossConnectors.push(createConnector(outerVertices[1], innerVertices[6]));
        crossConnectors.push(createConnector(outerVertices[2], innerVertices[5]));
        crossConnectors.push(createConnector(outerVertices[3], innerVertices[4]));
        crossConnectors.push(createConnector(outerVertices[4], innerVertices[3]));
        crossConnectors.push(createConnector(outerVertices[5], innerVertices[2]));
        crossConnectors.push(createConnector(outerVertices[6], innerVertices[1]));
        crossConnectors.push(createConnector(outerVertices[7], innerVertices[0]));
        
        // Create a fourth cube for the 4D effect (hypercube visualization)
        const hyperGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const hyperEdges = new THREE.EdgesGeometry(hyperGeometry);
        const hyperMaterial = new THREE.LineBasicMaterial({ 
            color: 0x88ff88,
            transparent: true,
            opacity: 0.9,
            linewidth: 1.5
        });
        const hyperCube = new THREE.LineSegments(hyperEdges, hyperMaterial);
        
        // Create a group to hold everything
        const tesseractGroup = new THREE.Group();
        tesseractGroup.add(outerCube);
        tesseractGroup.add(innerCube);
        tesseractGroup.add(middleCube);
        tesseractGroup.add(hyperCube);
        
        // Add connectors to group
        connectors.forEach(connector => tesseractGroup.add(connector));
        crossConnectors.forEach(connector => tesseractGroup.add(connector));
        
        // Add group to scene
        scene.add(tesseractGroup);
        
        // Create point lights for better effect
        const light1 = new THREE.PointLight(0x00ff00, 1, 100);
        light1.position.set(5, 5, 5);
        scene.add(light1);
        
        const light2 = new THREE.PointLight(0x00ff00, 0.5, 100);
        light2.position.set(-5, -5, -5);
        scene.add(light2);
        
        // Create particles for 4D effect
        const particleCount = 100;
        const particles = new THREE.BufferGeometry();
        const positions = [];
        const particleMaterial = new THREE.PointsMaterial({
            color: 0x00ff00,
            size: 0.03,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });
        
        // Create random positions
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 0.6 + Math.random() * 1.6;
            
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);
            
            positions.push(x, y, z);
        }
        
        particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const particleSystem = new THREE.Points(particles, particleMaterial);
        tesseractGroup.add(particleSystem);
        
        // Track if we're in folding animation mode
        let isFolding = false;
        let foldProgress = 0;
        let foldDirection = 1; // 1 = folding in, -1 = folding out
        let originalScales = {
            outer: { x: 1, y: 1, z: 1 },
            inner: { x: 1, y: 1, z: 1 },
            middle: { x: 1, y: 1, z: 1 },
            hyper: { x: 1, y: 1, z: 1 }
        };
        
        // Occasionally trigger a fold animation
        setInterval(() => {
            if (!isFolding) {
                isFolding = true;
                foldProgress = 0;
                foldDirection = Math.random() > 0.5 ? 1 : -1;
                
                // Save original scales
                originalScales.outer = { 
                    x: outerCube.scale.x,
                    y: outerCube.scale.y,
                    z: outerCube.scale.z
                };
                originalScales.inner = {
                    x: innerCube.scale.x,
                    y: innerCube.scale.y,
                    z: innerCube.scale.z
                };
                originalScales.middle = {
                    x: middleCube.scale.x,
                    y: middleCube.scale.y,
                    z: middleCube.scale.z
                };
                originalScales.hyper = {
                    x: hyperCube.scale.x,
                    y: hyperCube.scale.y,
                    z: hyperCube.scale.z
                };
            }
        }, 10000); // Every 10 seconds
        
        // Occasionally trigger a glitch effect
        setInterval(() => {
            if (Math.random() > 0.7) { // 30% chance
                // Apply a brief glitch effect
                const originalOpacity = outerMaterial.opacity;
                const originalColor = outerMaterial.color.clone();
                
                // Randomize colors and opacity
                const materials = [outerMaterial, innerMaterial, middleMaterial, hyperMaterial];
                
                materials.forEach(mat => {
                    mat.opacity = 0.2 + Math.random() * 0.8;
                    
                    if (Math.random() > 0.5) {
                        mat.color.setRGB(
                            Math.random() * 0.5,
                            0.5 + Math.random() * 0.5, // Keep green channel high
                            Math.random() * 0.3
                        );
                    }
                });
                
                // Reset after a short time
                setTimeout(() => {
                    materials.forEach(mat => {
                        mat.opacity = originalOpacity;
                        mat.color.copy(originalColor);
                    });
                }, 200);
            }
        }, 3000);
        
        // Animation function with more complex movement
        function animate() {
            requestAnimationFrame(animate);
            
            // Get the current time
            const time = Date.now() * 0.001;
            
            // Rotate the entire tesseract in different axes
            tesseractGroup.rotation.x += 0.003;
            tesseractGroup.rotation.y += 0.005;
            tesseractGroup.rotation.z += 0.002;
            
            // Add a second rotation to simulate 4D rotation
            const period = 10; // 10-second period
            const phase = (time % period) / period;
            
            // Inner cube pulsating and rotating differently
            innerCube.rotation.x = Math.sin(time * 0.3) * 0.2;
            innerCube.rotation.y = Math.sin(time * 0.5) * 0.2;
            
            // Middle cube rotating opposite
            middleCube.rotation.x = Math.sin(time * 0.2) * 0.3;
            middleCube.rotation.y = -Math.sin(time * 0.4) * 0.3;
            
            // Hyper cube with more complex rotation
            hyperCube.rotation.x = Math.sin(time * 0.7) * 0.5;
            hyperCube.rotation.y = Math.cos(time * 0.6) * 0.5;
            hyperCube.rotation.z = Math.sin(time * 0.8) * 0.3;
            
            // Animate particles in a 4D-like pattern
            const positions = particleSystem.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                // Get the current position
                let x = positions[i];
                let y = positions[i + 1];
                let z = positions[i + 2];
                
                // Calculate distance from center
                const distance = Math.sqrt(x*x + y*y + z*z);
                
                // Rotate based on distance (fourth dimension effect)
                const angle = time * 0.3 * (1 - distance / 2);
                
                // Apply rotation based on a 4D rotation matrix projection
                const newX = x * Math.cos(angle) - z * Math.sin(angle);
                const newZ = x * Math.sin(angle) + z * Math.cos(angle);
                
                positions[i] = newX;
                positions[i + 2] = newZ;
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;
            
            // Handle folding/unfolding animation
            if (isFolding) {
                foldProgress += 0.01 * foldDirection;
                
                // Clamp progress between 0 and 1
                if (foldProgress > 1) {
                    foldProgress = 1;
                    foldDirection = -1; // Start unfolding
                } else if (foldProgress < 0) {
                    foldProgress = 0;
                    foldDirection = 1; // Reset for next fold
                    isFolding = false;
                }
                
                // Apply folding effect
                if (foldDirection > 0) {
                    // Folding in: outer expands, inner contracts
                    outerCube.scale.set(
                        originalScales.outer.x * (1 + foldProgress * 0.5),
                        originalScales.outer.y * (1 + foldProgress * 0.5),
                        originalScales.outer.z * (1 + foldProgress * 0.5)
                    );
                    
                    innerCube.scale.set(
                        originalScales.inner.x * (1 - foldProgress * 0.9),
                        originalScales.inner.y * (1 - foldProgress * 0.9),
                        originalScales.inner.z * (1 - foldProgress * 0.9)
                    );
                    
                    middleCube.scale.set(
                        originalScales.middle.x * (1 - foldProgress * 0.3),
                        originalScales.middle.y * (1 - foldProgress * 0.3),
                        originalScales.middle.z * (1 - foldProgress * 0.3)
                    );
                    
                    hyperCube.scale.set(
                        originalScales.hyper.x * (1 - foldProgress * 0.6),
                        originalScales.hyper.y * (1 - foldProgress * 0.6),
                        originalScales.hyper.z * (1 - foldProgress * 0.6)
                    );
                } else {
                    // Folding out: outer contracts back, inner expands back
                    outerCube.scale.set(
                        originalScales.outer.x * (1 + (1 - foldProgress) * 0.5),
                        originalScales.outer.y * (1 + (1 - foldProgress) * 0.5),
                        originalScales.outer.z * (1 + (1 - foldProgress) * 0.5)
                    );
                    
                    innerCube.scale.set(
                        originalScales.inner.x * (1 - (1 - foldProgress) * 0.9),
                        originalScales.inner.y * (1 - (1 - foldProgress) * 0.9),
                        originalScales.inner.z * (1 - (1 - foldProgress) * 0.9)
                    );
                    
                    middleCube.scale.set(
                        originalScales.middle.x * (1 - (1 - foldProgress) * 0.3),
                        originalScales.middle.y * (1 - (1 - foldProgress) * 0.3),
                        originalScales.middle.z * (1 - (1 - foldProgress) * 0.3)
                    );
                    
                    hyperCube.scale.set(
                        originalScales.hyper.x * (1 - (1 - foldProgress) * 0.6),
                        originalScales.hyper.y * (1 - (1 - foldProgress) * 0.6),
                        originalScales.hyper.z * (1 - (1 - foldProgress) * 0.6)
                    );
                }
                
                // Also adjust opacity based on folding
                outerMaterial.opacity = 0.8 - foldProgress * 0.3;
                innerMaterial.opacity = 0.8 - foldProgress * 0.5;
                middleMaterial.opacity = 0.3 - foldProgress * 0.2;
                hyperMaterial.opacity = 0.9 - foldProgress * 0.6;
            } else {
                // Normal pulsing when not folding
                innerCube.scale.set(
                    0.9 + Math.sin(time * 0.7) * 0.1,
                    0.9 + Math.sin(time * 0.7) * 0.1,
                    0.9 + Math.sin(time * 0.7) * 0.1
                );
                
                hyperCube.scale.set(
                    1.0 + Math.sin(time * 1.1) * 0.2,
                    1.0 + Math.sin(time * 1.1) * 0.2,
                    1.0 + Math.sin(time * 1.1) * 0.2
                );
            }
            
            // Render scene
            renderer.render(scene, camera);
        }
        
        // Start animation
        animate();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        });
        
        // Add interactive effects on hover/click
        container.addEventListener('mousemove', (event) => {
            // Get mouse position relative to the container
            const rect = container.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
            const y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
            
            // Slightly adjust the rotation based on mouse position
            tesseractGroup.rotation.y = x * 0.5;
            tesseractGroup.rotation.x = y * 0.5;
        });
        
        // Add click effect
        container.addEventListener('click', () => {
            // Trigger a folding animation on click
            if (!isFolding) {
                isFolding = true;
                foldProgress = 0;
                foldDirection = 1;
                
                // Save original scales
                originalScales.outer = { 
                    x: outerCube.scale.x,
                    y: outerCube.scale.y,
                    z: outerCube.scale.z
                };
                originalScales.inner = {
                    x: innerCube.scale.x,
                    y: innerCube.scale.y,
                    z: innerCube.scale.z
                };
                originalScales.middle = {
                    x: middleCube.scale.x,
                    y: middleCube.scale.y,
                    z: middleCube.scale.z
                };
                originalScales.hyper = {
                    x: hyperCube.scale.x,
                    y: hyperCube.scale.y,
                    z: hyperCube.scale.z
                };
            }
        });
        
        console.log("Tesseract initialized successfully");
    } catch (error) {
        console.error("Error initializing tesseract:", error);
    }
}