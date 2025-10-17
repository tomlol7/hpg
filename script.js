let list;
const loading = document.getElementById('loading');
const imgContainer = document.getElementById('imgContainer');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');

// ===============================
// IMAGE DISPLAY + PREVIEW HANDLER
// ===============================
async function displayImg(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    imgContainer.replaceChildren(img);
}

// ===============================
// FILE UPLOAD (MODERN DRAG + CLICK)
// ===============================
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        previewImage.src = url;
        previewContainer.style.display = 'flex';
        await displayImg(url);
        analyze();
    }
});

dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        previewImage.src = url;
        previewContainer.style.display = 'flex';
        await displayImg(url);
        analyze();
    }
});

// ===============================
// MATH HELPERS
// ===============================
const dot = (a, b) => a.reduce((acc, n, i) => acc + n * b[i], 0);
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));

// ===============================
// MAIN ANALYZE FUNCTION
// ===============================
async function analyze() {
    if (!imgContainer.firstChild) {
        loading.textContent = 'No image to analyze.';
        return;
    }

    loading.textContent = 'Analyzing the image...';

    const detection = await faceapi
        .detectSingleFace(imgContainer.firstChild)
        .withFaceLandmarks()
        .withAgeAndGender()
        .withFaceDescriptor();

    if (!detection) {
        loading.textContent = 'No face detected. Try another image.';
        return;
    }

    // Gender auto-detection
    let gender = '';
    let genderShort = '';

    if (detection.genderProbability >= 0.5) {
        gender = detection.gender === 'male' ? 'Male' : 'Female';
        genderShort = gender.charAt(0).toLowerCase();
        loading.innerHTML = `Gender: <span style="color:${gender === 'Male' ? '#4da6ff' : '#ff6699'}">${gender}</span>`;
    } else {
        gender = 'Unknown';
        genderShort = '';
        loading.innerHTML = `Gender: <span style="color:#ffcc00">Unknown</span>`;
    }

    const i = genderShort === 'm' ? 1 : genderShort === 'f' ? 2 : 1;

    // Clone list for scoring
    let list2 = structuredClone(list);

    for (let j = 0; j < list2.length; j++) {
        const len2 = list2[j].length;
        if (len2 > 1) {
            list2[j][0][i] = cos(list2[j][0][i], detection.descriptor) * 100;
        }
        for (let k = 0; k < list2[j][len2 - 1].length; k++) {
            list2[j][len2 - 1][k][i] = cos(list2[j][len2 - 1][k][i], detection.descriptor) * 100;
        }
        list2[j][len2 - 1].sort((a, b) => b[i] - a[i]);
    }

    function grpScore(a) {
        if (a.length > 1) return Math.max(a[0][i], a[1][0][i]);
        return a[0][0][i];
    }

    list2.sort((a, b) => grpScore(b) - grpScore(a));
    list2 = list2.slice(0, 15);

    loading.textContent += ' | Results ready!';

    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = `
        <h2 style="width:100%;text-align:center;margin-bottom:1rem;">Top 15 Match Results</h2>
        <p style="width:100%;text-align:center;margin-bottom:1.5rem;color:#9ca3af;">
            These are the top 15 phenotypes that most closely match your uploaded image.
        </p>
    `;

    let displayedCount = 0;

    for (const a of list2) {
        const aLen = a.length;

        if (aLen > 1 && displayedCount < 15) {
            const name = a[0][0];
            const similarity = Math.round(a[0][i]);
            const imgSrc = `faces_lowres/basic/${name.toLowerCase()}${genderShort}.jpg`;
            const link = `http://humanphenotypes.net/basic/${name}.html`;

            resultsContainer.innerHTML += createCard(name, similarity, imgSrc, link);
            displayedCount++;
        }

        for (const arr of a[aLen - 1]) {
            if (displayedCount >= 15) break;

            const name = arr[0];
            const similarity = Math.round(arr[i]);
            const imgSrc = `faces_lowres/${name.toLowerCase()}${genderShort}.jpg`;
            const link = `http://humanphenotypes.net/${name}.html`;

            resultsContainer.innerHTML += createCard(name, similarity, imgSrc, link);
            displayedCount++;
        }

        if (displayedCount >= 15) break;
    }

    animateProgressBars();
}

// ===============================
// CARD + PROGRESS BAR ANIMATION
// ===============================
function createCard(name, similarity, imgSrc, link) {
    return `
        <div class="result-card">
            <a href="${link}" target="_blank">
                <img src="${imgSrc}" alt="${name}" onerror="this.src='placeholder.png'">
                <h3>${name}</h3>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:0%;"></div>
                </div>
                <span class="similarity" style="color:#60a5fa;">${similarity}% similarity</span>
            </a>
        </div>
    `;
}

function animateProgressBars() {
    const cards = document.querySelectorAll('.result-card');
    cards.forEach(card => {
        const similarityText = card.querySelector('.similarity').textContent;
        const percent = parseInt(similarityText);
        const bar = card.querySelector('.progress-fill');
        let width = 0;
        const interval = setInterval(() => {
            if (width >= percent) clearInterval(interval);
            else {
                width++;
                bar.style.width = width + '%';
            }
        }, 10);
    });
}

// ===============================
// MODEL + DATA LOADING
// ===============================
(async () => {
    await faceapi.loadSsdMobilenetv1Model('models');
    await faceapi.loadFaceLandmarkModel('models');
    await faceapi.loadFaceRecognitionModel('models');
    await faceapi.loadAgeGenderModel('models');

    const response = await fetch('list.json');
    const text = await response.text();
    list = JSON.parse(text);

    const hexToF32Arr = (str) =>
        new Float32Array(new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0))).buffer);
    const hexToF32 = (arr) => [arr[0], hexToF32Arr(arr[1]), hexToF32Arr(arr[2])];

    for (let i = 0; i < list.length; i++) {
        const len = list[i].length;
        if (len > 1) list[i][0] = hexToF32(list[i][0]);
        for (let j = 0; j < list[i][len - 1].length; j++) {
            list[i][len - 1][j] = hexToF32(list[i][len - 1][j]);
        }
    }

    loading.textContent = 'Models fetched!';
    const loader = document.getElementById('loader');
    if (loader) loader.remove();

    if (imgContainer.children.length > 0) analyze();
})();
