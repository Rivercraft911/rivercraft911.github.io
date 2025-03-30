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
    
  
    // Check and initialize Tesseract if THREE.js is available
    if (typeof THREE !== 'undefined') {
        console.log("THREE.js found, initializing tesseract...");
        // Small delay to ensure DOM is ready
        setTimeout(initTesseract, 100);
    } else {
        console.warn("THREE.js not loaded. Tesseract animation unavailable.");
    }
});

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
    const greetingAudio = document.getElementById('greeting-audio');
    const clickSound = document.getElementById('click-sound');
    const successSound = document.getElementById('success-sound');
    
    // Auto-play greeting on page load
    if (greetingAudio) {
        greetingAudio.volume = 0.5;
        
        // Try to play audio - browsers may block autoplay
        const playPromise = greetingAudio.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Autoplay prevented by browser: ", error);
            });
        }
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

// Initialize hover effects and fix navigation
function initHoverEffects() {
    // Project items hover
    const projectItems = document.querySelectorAll('.grid-item');
    projectItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px)';
            this.style.boxShadow = '0 0 15px var(--glow-color)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
        
        // Make grid items clickable to match what's shown in the images
        item.addEventListener('click', function() {
            // You could add a link to project details here if needed
            console.log('Project clicked');
        });
        
        // Make sure inner links don't trigger parent click
        const innerLinks = item.querySelectorAll('.project-link');
        innerLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
            });
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

// Function to scroll to section (fixing navigation)
function scrollToSection(sectionId) {
    event.preventDefault(); // Prevent default anchor behavior
    const section = document.getElementById(sectionId);
    if (section) {
        console.log("Scrolling to section:", sectionId);
        section.scrollIntoView({ behavior: 'smooth' });
    }
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