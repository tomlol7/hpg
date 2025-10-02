let list;
const loading = document.getElementById('loading');
const imgContainer = document.getElementById('imgContainer');

// Display uploaded image
async function displayImg(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  imgContainer.replaceChildren(img);
}

// Math helpers
const dot = (a, b) => a.reduce((acc, n, i) => acc + n * b[i], 0);
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));

async function analyze() {
  if (!imgContainer.firstChild) {
    loading.textContent = 'No image to analyze.';
    return;
  }

  loading.textContent = 'Analyzing the image. . .';

  const detection = await faceapi
    .detectSingleFace(imgContainer.firstChild)
    .withFaceLandmarks()
    .withAgeAndGender()
    .withFaceDescriptor();

  if (!detection) {
    loading.textContent = 'No face detected. Try another image.';
    return;
  }

  // Automatic gender detection (>50% probability)
  let genderText =
    detection.genderProbability > 0.5
      ? detection.gender === 'male'
        ? 'Male'
        : 'Female'
      : 'Unknown';
  let genderShort =
    genderText === 'Male'
      ? 'm'
      : genderText === 'Female'
      ? 'f'
      : 'm'; // default 'm' if unknown
  const i = genderShort === 'm' ? 1 : 2;

  // Display gender above results
  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.innerHTML = ''; // clear previous results
  const genderDisplay = document.createElement('p');
  genderDisplay.innerHTML = `Gender: <span class="gender">${genderText}</span>`;
  genderDisplay.style.textAlign = 'center';
  genderDisplay.style.fontWeight = '600';
  genderDisplay.style.fontSize = '1rem';
  genderDisplay.style.marginBottom = '1rem';

  if (genderText === 'Male') {
    genderDisplay.querySelector('.gender').style.color = '#3498db'; // blue
  } else if (genderText === 'Female') {
    genderDisplay.querySelector('.gender').style.color = '#e91e63'; // pink
  } else {
    genderDisplay.querySelector('.gender').style.color = '#9ca3af'; // gray
  }
  resultsContainer.appendChild(genderDisplay);

  // Clone list for scoring
  let list2 = structuredClone(list);
  for (let j = 0; j < list2.length; j++) {
    const len2 = list2[j].length;
    if (len2 > 1) {
      list2[j][0][i] = cos(list2[j][0][i], detection.descriptor) * 100;
    }
    for (let k = 0; k < list2[j][len2 - 1].length; k++) {
      list2[j][len2 - 1][k][i] =
        cos(list2[j][len2 - 1][k][i], detection.descriptor) * 100;
    }
    list2[j][len2 - 1].sort((a, b) => b[i] - a[i]);
  }

  function grpScore(a) {
    if (a.length > 1) {
      return Math.max(a[0][i], a[1][0][i]);
    }
    return a[0][0][i];
  }
  list2.sort((a, b) => grpScore(b) - grpScore(a));

  // Keep only top 10 groups
  list2 = list2.slice(0, 10);

  loading.textContent = 'Results!';

  // Display top matches
  let displayedCount = 0;
  resultsContainer.innerHTML += `
    <h2 style="width:100%;text-align:center;margin-bottom:1rem;">Top 10 Match Results</h2>
    <p style="width:100%;text-align:center;margin-bottom:1.5rem;color:#9ca3af;">
      These are the top 10 phenotypes that most closely match your uploaded image.
    </p>
  `;

  for (const a of list2) {
    const aLen = a.length;

    // Main match
    if (aLen > 1 && displayedCount < 10) {
      const name = a[0][0];
      const similarity = Math.round(a[0][i]);
      const imgSrc = `faces_lowres/basic/${name.toLowerCase()}${genderShort}.jpg`;
      const link = `http://humanphenotypes.net/basic/${name}.html`;

      resultsContainer.innerHTML += `
        <div>
          <a href="${link}" target="_blank">
            <img src="${imgSrc}" alt="${name}" onerror="this.src='placeholder.png'">
            <h3>${name}</h3>
            <span class="similarity">${similarity}% similarity</span>
          </a>
        </div>`;
      displayedCount++;
    }

    // Nested matches
    for (const arr of a[aLen - 1]) {
      if (displayedCount >= 10) break;
      const name = arr[0];
      const similarity = Math.round(arr[i]);
      const imgSrc = `faces_lowres/${name.toLowerCase()}${genderShort}.jpg`;
      const link = `http://humanphenotypes.net/${name}.html`;

      resultsContainer.innerHTML += `
        <div>
          <a href="${link}" target="_blank">
            <img src="${imgSrc}" alt="${name}" onerror="this.src='placeholder.png'">
            <h3>${name}</h3>
            <span class="similarity">${similarity}% similarity</span>
          </a>
        </div>`;
      displayedCount++;
    }

    if (displayedCount >= 10) break;
  }
}

// Handle file upload
document.getElementById('imgInp').onchange = async function () {
  const [file] = this.files;
  if (file) {
    await displayImg(URL.createObjectURL(file));
    analyze();
  }
};

// Load models + data
(async () => {
  await faceapi.loadSsdMobilenetv1Model('models');
  await faceapi.loadFaceLandmarkModel('models');
  await faceapi.loadFaceRecognitionModel('models');
  await faceapi.loadAgeGenderModel('models');

  const response = await fetch('list.json');
  const text = await response.text();
  list = JSON.parse(text);

  const hexToF32Arr = (str) =>
    new Float32Array(
      new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0))).buffer
    );
  const hexToF32 = (arr) => [arr[0], hexToF32Arr(arr[1]), hexToF32Arr(arr[2])];

  for (let i = 0; i < list.length; i++) {
    const len = list[i].length;
    if (len > 1) {
      list[i][0] = hexToF32(list[i][0]);
    }
    for (let j = 0; j < list[i][len - 1].length; j++) {
      list[i][len - 1][j] = hexToF32(list[i][len - 1][j]);
    }
  }

  loading.textContent = 'Models fetched!';
  const loader = document.getElementById('loader');
  if (loader) loader.remove();

  if (imgContainer.children.length > 0) analyze();
})();
