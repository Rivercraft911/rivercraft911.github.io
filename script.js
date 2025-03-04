// Main script file for River Dowdy's portfolio

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing scripts...");
    
    // Set current date in footer
    const now = new Date();
    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        lastUpdateEl.textContent = now.toISOString().split('T')[0];
    }
    
    // Initialize terminal typing effect
    initTerminalEffect();
    
    // Add random glitch effects
    setInterval(addRandomGlitch, 5000);
    
    // Add radar coordinate tracking
    initCoordinateTracking();
    
    // Initialize contact form functionality
    initContactForm();
    
    // Initialize hover effects
    initHoverEffects();
    
    // Check and initialize Tesseract if THREE.js is available
    if (typeof THREE !== 'undefined') {
        console.log("THREE.js found, initializing tesseract...");
        // Small delay to ensure DOM is ready
        setTimeout(initTesseract, 100);
    } else {
        console.warn("THREE.js not loaded. Tesseract animation unavailable.");
    }
});

// Initialize hover effects
function initHoverEffects() {
    // Project items hover
    const projectItems = document.querySelectorAll('.grid-item');
    projectItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 0 15px var(--glow-color)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
    });
    
    // Project links hover
    const projectLinks = document.querySelectorAll('.project-link');
    projectLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'var(--terminal-green-dark)';
            this.style.boxShadow = '0 0 5px var(--glow-color)';
            this.style.transform = 'translateY(-2px)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'transparent';
            this.style.boxShadow = 'none';
            this.style.transform = 'translateY(0)';
        });
    });
    
    // Nav links hover
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'var(--terminal-green-dark)';
            this.style.boxShadow = '0 0 10px var(--glow-color)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'transparent';
            this.style.boxShadow = 'none';
        });
    });
    
    // Contact methods hover
    const contactMethods = document.querySelectorAll('.contact-method');
    contactMethods.forEach(method => {
        method.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px)';
            this.style.boxShadow = '0 0 10px var(--glow-color)';
        });
        
        method.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
    });
    
    // Submit button hover
    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'var(--terminal-green-dark)';
            this.style.boxShadow = '0 0 10px var(--glow-color)';
            this.style.transform = 'translateY(-2px)';
        });
        
        submitBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'transparent';
            this.style.boxShadow = 'none';
            this.style.transform = 'translateY(0)';
        });
    }
}

// Initialize contact form
function initContactForm() {
    const contactForm = document.getElementById('contact-form');
    const formSuccess = document.querySelector('.form-success');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Simulate form submission
            setTimeout(function() {
                contactForm.style.display = 'none';
                if (formSuccess) {
                    formSuccess.style.display = 'block';
                }
            }, 1000);
        });
    }
}

// Terminal typing effect
function initTerminalEffect() {
    console.log("Initializing terminal effect");
    
    // Console lines in header
    const consoleLines = document.querySelectorAll('.terminal-line');
    let delay = 0;
    
    consoleLines.forEach(line => {
        const text = line.textContent;
        line.textContent = '';
        line.style.display = 'block';
        
        setTimeout(() => {
            let i = 0;
            const typeInterval = setInterval(() => {
                if (i < text.length) {
                    line.textContent += text.charAt(i);
                    i++;
                } else {
                    clearInterval(typeInterval);
                }
            }, 20);
        }, delay);
        
        delay += 800;
    });
}

// Random glitch effect for UI elements
function addRandomGlitch() {
    const elements = document.querySelectorAll('h1, h2, h3, h4, .classification, .project-badge');
    if (elements.length === 0) return;
    
    const randomElement = elements[Math.floor(Math.random() * elements.length)];
    
    randomElement.classList.add('glitch');
    
    setTimeout(() => {
        randomElement.classList.remove('glitch');
    }, 500);
}

// Coordinate tracking for radar display
function initCoordinateTracking() {
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX;
        const y = e.clientY;
        
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Update coordinates display
        const coords = document.querySelector('.coordinates');
        if (coords) {
            // Convert pixel coordinates to fake lat/long for effect
            const fakeLat = (37.4275 + (y / windowHeight * 0.01)).toFixed(4);
            const fakeLong = (122.1697 + (x / windowWidth * 0.01)).toFixed(4);
            coords.textContent = `LAT: ${fakeLat}° N • LONG: ${fakeLong}° W`;
        }
    });
}

// Enhanced Tesseract Animation
function initTesseract() {
    try {
        console.log("Initializing enhanced tesseract");
        
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
        
        // Create a group to hold everything
        const tesseractGroup = new THREE.Group();
        tesseractGroup.add(outerCube);
        tesseractGroup.add(innerCube);
        tesseractGroup.add(middleCube);
        
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
        
        // Animation function with more complex movement
        function animate() {
            requestAnimationFrame(animate);
            
            // Rotate the entire tesseract in different axes
            tesseractGroup.rotation.x += 0.003;
            tesseractGroup.rotation.y += 0.005;
            tesseractGroup.rotation.z += 0.002;
            
            // Add a second rotation to simulate 4D rotation
            const time = Date.now() * 0.001;
            
            // Inner cube pulsating and rotating differently
            innerCube.scale.set(
                0.9 + Math.sin(time * 0.7) * 0.1,
                0.9 + Math.sin(time * 0.7) * 0.1,
                0.9 + Math.sin(time * 0.7) * 0.1
            );
            
            innerCube.rotation.x = Math.sin(time * 0.3) * 0.2;
            innerCube.rotation.y = Math.sin(time * 0.5) * 0.2;
            
            // Middle cube rotating opposite
            middleCube.rotation.x = Math.sin(time * 0.2) * 0.3;
            middleCube.rotation.y = -Math.sin(time * 0.4) * 0.3;
            
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
        
        console.log("Tesseract initialized successfully");
    } catch (error) {
        console.error("Error initializing tesseract:", error);
    }
}