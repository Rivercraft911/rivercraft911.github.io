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
    
    // Initialize audio elements
    initAudio();
    
    // Initialize uptime counter
    initUptimeCounter();
    
    // Initialize oscilloscope
    initOscilloscope();
    
    // Add radar blip
    initRadarBlip();
    
    // Check and initialize Tesseract if THREE.js is available
    if (typeof THREE !== 'undefined') {
        console.log("THREE.js found, initializing tesseract...");
        // Small delay to ensure DOM is ready
        setTimeout(initTesseract, 100);
    } else {
        console.warn("THREE.js not loaded. Tesseract animation unavailable.");
    }
});

// Initialize radar blip functionality
function initRadarBlip() {
    const radar = document.querySelector('.radar-container');
    const blip = document.querySelector('.radar-blip');
    
    if (!radar || !blip) return;
    
    // Add random blips periodically
    setInterval(() => {
        // Random position within the radar
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 0.8; // Keep within 80% of radius
        
        const x = Math.cos(angle) * distance * 50 + 50;
        const y = Math.sin(angle) * distance * 50 + 50;
        
        blip.style.top = `${y}%`;
        blip.style.left = `${x}%`;
        
        // Show blip
        blip.style.opacity = '1';
        
        // Hide after a short time
        setTimeout(() => {
            blip.style.opacity = '0';
        }, 1000);
    }, 3000);
}

// Initialize oscilloscope effect
function initOscilloscope() {
    const canvas = document.getElementById('oscilloscope');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Function to draw the oscilloscope wave
    function drawWave() {
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid lines
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.lineWidth = 1;
        
        // Vertical grid lines
        for (let x = 0; x < width; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal grid lines
        for (let y = 0; y < height; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw sine wave with message pattern
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const time = Date.now() * 0.001;
        const frequency = 0.05;
        const amplitude = height * 0.2;
        
        // Create the message pattern - spell "WELCOME VISITOR"
        const messagePattern = [
            1.0, 0.5, 1.0, 0.5, 1.0, 0.5, 1.0, 0.2, // W
            0.5, 1.0, 0.5, 0.2, // E
            0.5, 0.2, 1.0, 0.5, 0.5, 0.2, // L
            0.5, 1.0, 0.5, 1.0, 0.5, 0.2, // C
            0.5, 1.0, 0.5, 1.0, 0.5, 0.2, // O
            0.5, 1.0, 0.5, 0.5, 0.5, 0.2, // M
            0.5, 1.0, 0.5, 0.2, // E
            0.2, 0.2, 0.2, // space
            1.0, 0.5, 1.0, 0.5, 0.5, 0.2, // V
            0.3, 1.0, 0.3, 0.2, // I
            0.5, 0.5, 0.5, 0.5, 0.5, 0.2, // S
            0.3, 1.0, 0.3, 0.2, // I
            0.5, 0.5, 0.5, 0.5, 0.5, 0.2, // T
            0.5, 1.0, 0.5, 1.0, 0.5, 0.2, // O
            0.5, 0.5, 1.0, 0.2, // R
        ];
        
        ctx.moveTo(0, height / 2);
        
        for (let x = 0; x < width; x++) {
            // Base sine wave
            let y = Math.sin((x * frequency) + time) * amplitude;
            
            // Apply message pattern
            const patternIndex = Math.floor((x / width * messagePattern.length) % messagePattern.length);
            y *= messagePattern[patternIndex];
            
            // Center the wave
            y += height / 2;
            
            ctx.lineTo(x, y);
        }
        
        ctx.stroke();
        
        // Add glow effect
        ctx.shadowColor = 'rgba(0, 255, 0, 0.7)';
        ctx.shadowBlur = 5;
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
        
        requestAnimationFrame(drawWave);
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    });
    
    // Start animation
    drawWave();
}

// Initialize uptime counter
function initUptimeCounter() {
    const uptimeEl = document.getElementById('uptime-counter');
    if (!uptimeEl) return;
    
    const startTime = Date.now();
    
    setInterval(() => {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
        const seconds = Math.floor(uptime % 60).toString().padStart(2, '0');
        
        uptimeEl.textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// Initialize audio functionality
function initAudio() {
    const greetingBtn = document.getElementById('audio-greeting');
    const greetingAudio = document.getElementById('greeting-audio');
    const clickSound = document.getElementById('click-sound');
    const successSound = document.getElementById('success-sound');
    
    if (greetingBtn && greetingAudio) {
        greetingBtn.addEventListener('click', () => {
            greetingAudio.currentTime = 0;
            greetingAudio.play();
        });
    }
    
    // Add click sounds to buttons and links
    const buttons = document.querySelectorAll('button, .project-link, .nav-link');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (clickSound) {
                clickSound.currentTime = 0;
                clickSound.volume = 0.3;
                clickSound.play();
            }
        });
    });
    
    // Add submit sound to form
    const form = document.getElementById('contact-form');
    if (form && successSound) {
        form.addEventListener('submit', () => {
            successSound.currentTime = 0;
            successSound.volume = 0.5;
            successSound.play();
        });
    }
}

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
        
        // Make sure inner links don't trigger parent link
        const innerLinks = item.querySelectorAll('.project-link');
        innerLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    });
    
    // Nav links hover and active state
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        // Add active class when scrolled to section
        window.addEventListener('scroll', () => {
            const targetId = link.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                const rect = targetSection.getBoundingClientRect();
                const offset = 200; // Adjust based on your layout
                
                if (rect.top <= offset && rect.bottom > offset) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            }
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
}

// Initialize enhanced contact form with validation
function initContactForm() {
    const contactForm = document.getElementById('contact-form');
    const formSuccess = document.querySelector('.form-success');
    
    if (!contactForm) return;
    
    // Input validation messages
    const nameValidation = document.getElementById('name-validation');
    const emailValidation = document.getElementById('email-validation');
    const subjectValidation = document.getElementById('subject-validation');
    const messageValidation = document.getElementById('message-validation');
    
    // Add validation on input
    const nameInput = document.getElementById('name');
    if (nameInput && nameValidation) {
        nameInput.addEventListener('input', () => {
            if (nameInput.value.length < 2) {
                nameValidation.textContent = 'Name must be at least 2 characters long';
                nameInput.style.borderColor = 'var(--error-red)';
            } else {
                nameValidation.textContent = '';
                nameInput.style.borderColor = 'var(--terminal-green-dark)';
            }
        });
    }
    
    // Validate email format
    const emailInput = document.getElementById('email');
    if (emailInput && emailValidation) {
        emailInput.addEventListener('input', () => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailInput.value)) {
                emailValidation.textContent = 'Please enter a valid email address';
                emailInput.style.borderColor = 'var(--error-red)';
            } else {
                emailValidation.textContent = '';
                emailInput.style.borderColor = 'var(--terminal-green-dark)';
            }
        });
    }
    
    // Subject validation
    const subjectInput = document.getElementById('subject');
    if (subjectInput && subjectValidation) {
        subjectInput.addEventListener('input', () => {
            if (subjectInput.value.length < 3) {
                subjectValidation.textContent = 'Subject must be at least 3 characters long';
                subjectInput.style.borderColor = 'var(--error-red)';
            } else {
                subjectValidation.textContent = '';
                subjectInput.style.borderColor = 'var(--terminal-green-dark)';
            }
        });
    }
    
    // Message validation
    const messageInput = document.getElementById('message');
    if (messageInput && messageValidation) {
        messageInput.addEventListener('input', () => {
            if (messageInput.value.length < 10) {
                messageValidation.textContent = 'Message must be at least 10 characters long';
                messageInput.style.borderColor = 'var(--error-red)';
            } else {
                messageValidation.textContent = '';
                messageInput.style.borderColor = 'var(--terminal-green-dark)';
            }
        });
    }
    
    // Form submission
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Validate all fields
        let isValid = true;
        
        if (nameInput.value.length < 2) {
            nameValidation.textContent = 'Name must be at least 2 characters long';
            nameInput.style.borderColor = 'var(--error-red)';
            isValid = false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value)) {
            emailValidation.textContent = 'Please enter a valid email address';
            emailInput.style.borderColor = 'var(--error-red)';
            isValid = false;
        }
        
        if (subjectInput.value.length < 3) {
            subjectValidation.textContent = 'Subject must be at least 3 characters long';
            subjectInput.style.borderColor = 'var(--error-red)';
            isValid = false;
        }
        
        if (messageInput.value.length < 10) {
            messageValidation.textContent = 'Message must be at least 10 characters long';
            messageInput.style.borderColor = 'var(--error-red)';
            isValid = false;
        }
        
        if (isValid) {
            // Show typing indicator during "sending"
            const loadingIndicator = document.createElement('div');
            loadingIndicator.classList.add('typing-indicator');
            loadingIndicator.innerHTML = 'Sending transmission<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
            
            const submitBtn = contactForm.querySelector('.submit-btn');
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
            submitBtn.parentNode.insertBefore(loadingIndicator, submitBtn);
            
            // Simulate form submission with delay
            setTimeout(function() {
                contactForm.style.display = 'none';
                if (formSuccess) {
                    formSuccess.style.display = 'block';
                }
                
                // Play success sound if available
                const successSound = document.getElementById('success-sound');
                if (successSound) {
                    successSound.play();
                }
            }, 1500);
        }
    });
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
    const elements = document.querySelectorAll('h1, h2, h3, h4, .classification, .project-badge, .coordinates');
    if (elements.length === 0) return;
    
    const randomElement = elements[Math.floor(Math.random() * elements.length)];
    
    randomElement.classList.add('glitch');
    
    // Add random text distortion for terminal-like effect
    const originalText = randomElement.textContent;
    if (Math.random() > 0.7) { // 30% chance of text glitch
        const glitchText = originalText.split('')
            .map(char => {
                // 20% chance to replace character with random character
                if (Math.random() < 0.2) {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/\\';
                    return chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return char;
            })
            .join('');
        
        randomElement.textContent = glitchText;
        
        // Restore original text after short delay
        setTimeout(() => {
            randomElement.textContent = originalText;
        }, 300);
    }
    
    setTimeout(() => {
        randomElement.classList.remove('glitch');
    }, 500);
}

// Coordinate tracking for radar display
function initCoordinateTracking() {
    const coords = document.querySelector('.coordinates');
    const footerCoords = document.getElementById('footer-coordinates');
    
    if (!coords && !footerCoords) return;
    
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX;
        const y = e.clientY;
        
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Convert pixel coordinates to fake lat/long for effect
        const fakeLat = (37.4275 + (y / windowHeight * 0.01)).toFixed(4);
        const fakeLong = (122.1697 + (x / windowWidth * 0.01)).toFixed(4);
        
        if (coords) {
            coords.textContent = `LAT: ${fakeLat}° N • LONG: ${fakeLong}° W`;
        }
        
        if (footerCoords) {
            footerCoords.textContent = `${fakeLat}° N, ${fakeLong}° W`;
        }
    });
}