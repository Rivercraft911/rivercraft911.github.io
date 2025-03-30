// Military Effects script 
document.addEventListener('DOMContentLoaded', function() {
    console.log("Initializing military effects...");
    
    // Initialize status indicators
    initStatusIndicators();
    
    // Initialize blinking indicators
    initBlinkingIndicators();
    
    // Initialize system messages
    initSystemMessages();
});

// System Status Indicators
function initStatusIndicators() {
    const statusIndicators = document.querySelectorAll('.status-indicator');
    
    statusIndicators.forEach(indicator => {
        const statusDot = indicator.querySelector('.status-dot');
        
        // Random starting state
        let isActive = Math.random() > 0.3; // 70% chance to be active initially
        
        if (isActive && statusDot) {
            statusDot.style.backgroundColor = 'var(--terminal-green)';
            statusDot.style.boxShadow = '0 0 5px var(--glow-color)';
        } else if (statusDot) {
            statusDot.style.backgroundColor = 'var(--dark-bg-2)';
            statusDot.style.boxShadow = 'none';
        }
        
        // Every 2-5 seconds, toggle state
        const interval = 2000 + Math.random() * 3000;
        
        setInterval(() => {
            // 80% chance to toggle, 20% chance to stay the same
            if (Math.random() > 0.2) {
                isActive = !isActive;
                
                if (isActive && statusDot) {
                    statusDot.style.backgroundColor = 'var(--terminal-green)';
                    statusDot.style.boxShadow = '0 0 5px var(--glow-color)';
                } else if (statusDot) {
                    statusDot.style.backgroundColor = 'var(--dark-bg-2)';
                    statusDot.style.boxShadow = 'none';
                }
            }
        }, interval);
    });
    
    // Online status should be more stable - mostly on
    const onlineStatus = document.querySelector('.online-status .status-dot');
    if (onlineStatus) {
        // Make online status more reliable - 90% uptime
        setInterval(() => {
            const isOnline = Math.random() > 0.1; // 90% chance to be online
            
            if (isOnline) {
                onlineStatus.style.backgroundColor = 'var(--success-green)';
                onlineStatus.style.boxShadow = '0 0 5px rgba(40, 167, 69, 0.7)';
            } else {
                onlineStatus.style.backgroundColor = 'var(--error-red)';
                onlineStatus.style.boxShadow = '0 0 5px rgba(220, 53, 69, 0.7)';
                
                // If it goes offline, it should recover quickly
                setTimeout(() => {
                    onlineStatus.style.backgroundColor = 'var(--success-green)';
                    onlineStatus.style.boxShadow = '0 0 5px rgba(40, 167, 69, 0.7)';
                }, 500 + Math.random() * 1000);
            }
        }, 8000 + Math.random() * 2000);
    }
    
    // Data transmission indicator should blink more frequently
    const dataStatus = document.querySelector('.data-status .status-dot');
    if (dataStatus) {
        setInterval(() => {
            const isTransmitting = Math.random() > 0.3; // 70% chance to be transmitting
            
            if (isTransmitting) {
                dataStatus.style.backgroundColor = 'var(--biocomputing-blue)';
                dataStatus.style.boxShadow = '0 0 5px rgba(0, 255, 255, 0.7)';
            } else {
                dataStatus.style.backgroundColor = 'var(--dark-bg-2)';
                dataStatus.style.boxShadow = 'none';
            }
        }, 1000 + Math.random() * 1000);
    }
}

// Blinking Indicators and Lights
function initBlinkingIndicators() {
    // Create blinking indicators in the footer
    const footerSections = document.querySelectorAll('.footer-section');
    
    footerSections.forEach(section => {
        // Add blinkers to each footer section
        const blinker = document.createElement('div');
        blinker.classList.add('status-blinker');
        section.appendChild(blinker);
        
        // Set random blinking pattern
        const blinkRate = 1000 + Math.random() * 2000;
        
        setInterval(() => {
            blinker.classList.toggle('active');
        }, blinkRate);
    });
    
    // Style for the blinkers
    const style = document.createElement('style');
    style.textContent = `
        .status-blinker {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--terminal-green-dark);
            transition: all 0.2s ease;
        }
        
        .status-blinker.active {
            background-color: var(--terminal-green);
            box-shadow: 0 0 5px var(--glow-color);
        }
    `;
    document.head.appendChild(style);
    
    // Add random scan lines that move across sections
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
        const scanLine = document.createElement('div');
        scanLine.classList.add('section-scan-line');
        section.appendChild(scanLine);
        
        // Scan periodically
        const scanInterval = 5000 + Math.random() * 10000; // Between 5-15 seconds
        
        function triggerScan() {
            scanLine.classList.add('scanning');
            
            setTimeout(() => {
                scanLine.classList.remove('scanning');
            }, 1000); // Scan duration
        }
        
        // Initial scan after random delay
        setTimeout(() => {
            triggerScan();
            
            // Then regular interval
            setInterval(triggerScan, scanInterval);
        }, Math.random() * 5000);
    });
    
    // Style for scan lines
    const scanStyle = document.createElement('style');
    scanStyle.textContent = `
        .section-scan-line {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 2px;
            background-color: rgba(0, 255, 0, 0.5);
            box-shadow: 0 0 5px var(--glow-color);
            transform: translateY(-10px);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
        }
        
        .section-scan-line.scanning {
            opacity: 0.7;
            animation: section-scan 1s linear forwards;
        }
        
        @keyframes section-scan {
            from {
                transform: translateY(0);
            }
            to {
                transform: translateY(100%);
            }
        }
    `;
    document.head.appendChild(scanStyle);
}

// System Messages
function initSystemMessages() {
    // Create a container for system messages
    const messagesContainer = document.createElement('div');
    messagesContainer.classList.add('system-messages');
    document.body.appendChild(messagesContainer);
    
    // Style for messages
    const messageStyle = document.createElement('style');
    messageStyle.textContent = `
        .system-messages {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 250px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        }
        
        .system-message {
            background-color: rgba(0, 10, 0, 0.8);
            border: 1px solid var(--terminal-green-dark);
            padding: 8px 12px;
            border-radius: 3px;
            color: var(--terminal-green);
            font-size: 0.8rem;
            box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
            transform: translateX(-150%);
            transition: transform 0.3s ease;
            opacity: 0.9;
        }
        
        .system-message.visible {
            transform: translateX(0);
        }
        
        .system-message.info {
            border-left: 3px solid var(--terminal-green);
        }
        
        .system-message.warning {
            border-left: 3px solid var(--warning-orange);
        }
        
        .system-message.error {
            border-left: 3px solid var(--error-red);
        }
        
        .system-message.success {
            border-left: 3px solid var(--success-green);
        }
    `;
    document.head.appendChild(messageStyle);
    
    // System message templates
    const systemMessages = [
        { type: 'info', text: 'SYSTEM OPERATIONAL' },
        { type: 'info', text: 'SECURE CONNECTION ESTABLISHED' },
        { type: 'info', text: 'MONITORING ACTIVE' },
        { type: 'info', text: 'AREA SCAN COMPLETE' },
        { type: 'info', text: 'PERIMETER SECURE' },
        { type: 'info', text: 'DATA STREAM STABLE' },
        { type: 'warning', text: 'SIGNAL FLUCTUATION DETECTED' },
        { type: 'warning', text: 'BANDWIDTH OPTIMIZATION REQUIRED' },
        { type: 'warning', text: 'AMBIENT NOISE LEVEL ELEVATED' },
        { type: 'success', text: 'DIAGNOSTICS COMPLETED SUCCESSFULLY' },
        { type: 'success', text: 'CONNECTION PARAMETERS OPTIMIZED' },
        { type: 'success', text: 'HANDSHAKE COMPLETE' }
    ];
    
    // Function to show a system message
    function showSystemMessage(type, text) {
        const message = document.createElement('div');
        message.classList.add('system-message', type);
        message.textContent = text;
        
        messagesContainer.appendChild(message);
        
        // Slight delay before showing for transition effect
        setTimeout(() => {
            message.classList.add('visible');
        }, 100);
        
        // Remove after display time
        setTimeout(() => {
            message.classList.remove('visible');
            
            // Remove from DOM after transition
            setTimeout(() => {
                message.remove();
            }, 300);
        }, 4000);
    }
    
    setTimeout(() => {
        showSystemMessage('info', 'SYSTEM INITIALIZED');
    }, 2000);
    

    setInterval(() => {
        // 30% chance to show a message
        if (Math.random() > 0.7) {
            const randomMessage = systemMessages[Math.floor(Math.random() * systemMessages.length)];
            showSystemMessage(randomMessage.type, randomMessage.text);
        }
    }, 8000);
    
    document.addEventListener('click', () => {
        // 20% chance to show a message on click
        if (Math.random() > 0.8) {
            const randomMessage = systemMessages[Math.floor(Math.random() * systemMessages.length)];
            showSystemMessage(randomMessage.type, randomMessage.text);
        }
    });
    
    // Add sound effects for system events
    const soundEffects = {
        message: new Audio(),
        alert: new Audio(),
        success: new Audio()
    };
    
    // Set fake source paths (would need to be created)
    soundEffects.message.src = 'assets/audio/message.mp3';
    soundEffects.alert.src = 'assets/audio/alert.mp3';
    soundEffects.success.src = 'assets/audio/success.mp3';
    
    // Set volume
    Object.values(soundEffects).forEach(sound => {
        sound.volume = 0.2;
    });
    
    // Create system operational beacon
    const beacon = document.createElement('div');
    beacon.classList.add('system-beacon');
    messagesContainer.appendChild(beacon);
    
    // Add beacon styles
    const beaconStyle = document.createElement('style');
    beaconStyle.textContent = `
        .system-beacon {
            margin-top: 10px;
            height: 3px;
            width: 50px;
            background-color: var(--terminal-green-dark);
            position: relative;
        }
        
        .system-beacon::before {
            content: "SYSTEM OPERATIONAL";
            position: absolute;
            top: -15px;
            left: 0;
            font-size: 8px;
            color: var(--terminal-green-light);
        }
        
        .system-beacon::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 5px;
            background-color: var(--terminal-green);
            box-shadow: 0 0 5px var(--glow-color);
            animation: beacon-pulse 3s infinite;
        }
        
        @keyframes beacon-pulse {
            0% { left: 0; }
            100% { left: 45px; }
        }
    `;
    document.head.appendChild(beaconStyle);
    
    // Export function to show system messages globally
    window.showSystemMessage = showSystemMessage;
}