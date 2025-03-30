
# Military-Style Terminal Portfolio

![Military Terminal Portfolio Screenshot](screenshot.png)

## 🔒 Overview

A retro military/radar green aesthetic portfolio website designed for engineers, developers, and paradigm shifters. This project features an interactive terminal-inspired design with animated tesseract visualization, radar effects, oscilloscope waveforms, and military-style status indicators.

## ⚡ Features

- **Retro Military Terminal Aesthetic** - Green terminal-style design with scan lines, radar effects, and glitch animations
- **4D Tesseract** - Dynamic visualization with fold-in animations and particle effects
- **Project Gallery System(inprogress)** - Detailed project pages with galleries, technical details, and demos

## 🛠️ Technologies

- HTML5
- CSS3
- JavaScript
- THREE.js (for 4D Tesseract visualization)
- Howler.js (for audio support)

## 📂 Project Structure

```
rivercraft911.github.io/
├── index.html                # Main landing page
├── css/
│   ├── styles.css           # Main stylesheet
│   └── project-detail.css   # Styles for project pages
├── js/
│   ├── script.js            # Main JavaScript file
│   ├── tesseract.js         # Tesseract animation code
│   └── military-effects.js  # Special effects (sine waves, etc)
├── assets/
│   ├── audio/               # Audio files
│   │   ├── welcome.mp3      # Welcome message
│   │   ├── click.mp3        # Button click sound
│   │   └── success.mp3      # Success sound
│   └── images/              # Project images
└── projects/                # Project detail pages
    ├── redstone-computer.html
    └── [other project pages]
```

## 🚀 Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/rivercraft911/rivercraft911.github.io.git
   ```

2. Open `index.html` in your browser to view the portfolio.

3. Customize the content:
   - Update personal information in `index.html`
   - Modify projects in the projects section and create corresponding detail pages
   - Adjust skills and their levels in the skills section
   - Replace placeholder images with your own in the `/assets/images/` directory

## 💻 Usage

This portfolio template is designed to showcase technical projects with a unique military/radar aesthetic. It's perfect for:

- Engineers
- Cool people
- Anyone who appreciates a retro terminal aesthetic

## 🎨 Customization

### Changing Colors

The primary color scheme is defined in CSS variables at the top of `styles.css`:

```css
:root {
    --terminal-green: #0f0;
    --terminal-green-dark: #007700;
    --terminal-green-light: #8afa8a;
    /* other colors */
}
```

### Adding Projects

1. Create a new project card in the "Projects" section of `index.html`
2. Create a new project detail page in the `/projects/` directory using the template
3. Link them together

## 📝 License

This project is free to use and modify. Feel free to make your own portfolio based on this!

---

<p align="center">
  <img src="terminal-icon.png" alt="Terminal Icon" width="60">
  <br>
  <em>PARADIGM-SHIFT-PROTOCOL // CLEARANCE LEVEL: BEYOND TOP SECRET</em>
</p>