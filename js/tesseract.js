function initTesseract() {
    const container = document.getElementById('tesseract-animation');
    if (!container) {
        console.error("Tesseract container not found");
        return;
    }

    // Create scene, camera, renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Material for drawing lines
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8
    });

    // Generate the original 4D vertices for the tesseract
    const vertices4D = [];
    for (let x = -1; x <= 1; x += 2) {
        for (let y = -1; y <= 1; y += 2) {
            for (let z = -1; z <= 1; z += 2) {
                for (let w = -1; w <= 1; w += 2) {
                    vertices4D.push(new THREE.Vector4(x, y, z, w));
                }
            }
        }
    }

    // Create edges – connecting vertices that differ in only one coordinate
    const edges = [];
    for (let i = 0; i < vertices4D.length; i++) {
        for (let j = i + 1; j < vertices4D.length; j++) {
            let diff = 0;
            const v1 = vertices4D[i];
            const v2 = vertices4D[j];
            if (v1.x !== v2.x) diff++;
            if (v1.y !== v2.y) diff++;
            if (v1.z !== v2.z) diff++;
            if (v1.w !== v2.w) diff++;
            if (diff === 1) {
                edges.push([i, j]);
            }
        }
    }

    // Group to hold line segments
    const linesGroup = new THREE.Group();
    scene.add(linesGroup);

    // --- 4D Rotation functions ---
    function rotateXY(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new THREE.Vector4(
            v.x * cos - v.y * sin,
            v.x * sin + v.y * cos,
            v.z,
            v.w
        );
    }

    function rotateXW(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new THREE.Vector4(
            v.x * cos - v.w * sin,
            v.y,
            v.z,
            v.x * sin + v.w * cos
        );
    }

    function rotateYZ(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new THREE.Vector4(
            v.x,
            v.y * cos - v.z * sin,
            v.y * sin + v.z * cos,
            v.w
        );
    }

    function rotateZW(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new THREE.Vector4(
            v.x,
            v.y,
            v.z * cos - v.w * sin,
            v.z * sin + v.w * cos
        );
    }

    // --- 4D to 3D Projection ---
    function project4Dto3D(v, distance) {
        // Adjust the 'distance' to control the perspective effect.
        const factor = distance / (distance - v.w);
        return new THREE.Vector3(
            v.x * factor,
            v.y * factor,
            v.z * factor
        );
    }

    let time = 0;
    function animate() {
        requestAnimationFrame(animate);
        time += 0.01;

        // Clear previous lines
        while (linesGroup.children.length) {
            linesGroup.remove(linesGroup.children[0]);
        }

        // Define rotation angles (feel free to tweak these)
        const angleXY = time * 0.5;
        const angleXW = time * 0.3;
        const angleYZ = time * 0.2;
        const angleZW = time * 0.4;

        // Apply the rotations sequentially to each vertex
        const rotatedVertices = vertices4D.map(v => {
            let temp = v.clone();
            temp = rotateXY(temp, angleXY);
            temp = rotateXW(temp, angleXW);
            temp = rotateYZ(temp, angleYZ);
            temp = rotateZW(temp, angleZW);
            return temp;
        });

        // Project each 4D vertex into 3D space.
        // Using a larger 'distance' (here 4) produces a nicer perspective.
        const projected3D = rotatedVertices.map(v => project4Dto3D(v, 4));

        // Draw edges based on the projected vertices.
        edges.forEach(([i, j]) => {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                projected3D[i],
                projected3D[j]
            ]);
            const line = new THREE.Line(geometry, lineMaterial);
            linesGroup.add(line);
        });

        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize.
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}