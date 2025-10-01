// script.js

// =====================
// LOAD MODELS
// =====================
async function loadModels() {
  const MODEL_URL = './models';
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
  document.getElementById('loading').textContent = 'Models loaded. Ready!';
}

loadModels();

// =====================
// FILE UPLOAD PREVIEW
// =====================
const imgInp = document.getElementById('imgInp');
const imgContainer = document.getElementById('imgContainer');
const loading = document.getElementById('loading');

imgInp.addEventListener('change', () => {
  const file = imgInp.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      imgContainer.innerHTML = `<img src="${e.target.result}" alt="Uploaded Image">`;
      analyze();
    };
    reader.readAsDataURL(file);
  }
});

// =====================
// COSINE SIMILARITY
// =====================
function cos(descriptor1, descriptor2) {
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < descriptor1.length; i++) {
    dot += descriptor1[i] * descriptor2[i];
    normA += descriptor1[i] * descriptor1[i];
    normB += descriptor2[i] * descriptor2[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// =====================
// MAIN ANALYZE FUNCTION
// =====================
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

  let sex = detection.gender;
  if (
    confirm(
      `The program thinks you are ${sex} with ${(detection.genderProbability * 100).toFixed(
        0
      )}% confidence. Is this correct?`
    )
  ) {
    sex = sex.substring(0, 1); // "m" or "f"
  } else {
    sex = sex === 'female' ? 'm' : 'f';
  }
  const i = sex === 'm' ? 1 : 2;

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

  // ✅ Flatten all results into one array
  let allResults = [];
  for (const a of list2) {
    const aLen = a.length;

    // Add main match
    if (aLen > 1) {
      allResults.push({
        name: a[0][0],
        similarity: Math.round(a[0][i]),
        sex,
        isBasic: true,
      });
    }

    // Add nested matches
    for (const arr of a[aLen - 1]) {
      allResults.push({
        name: arr[0],
        similarity: Math.round(arr[i]),
        sex,
        isBasic: false,
      });
    }
  }

  // ✅ Sort everything by similarity descending
  allResults.sort((a, b) => b.similarity - a.similarity);

  // ✅ Keep only top 10
  allResults = allResults.slice(0, 10);

  // Render results
  loading.textContent = 'Results!';
  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.innerHTML = `
    <h2 style="width:100%;text-align:center;margin-bottom:1rem;">Top 10 Match Results</h2>
    <p style="width:100%;text-align:center;margin-bottom:1.5rem;color:#9ca3af;">
      Sorted from most to least similar.
    </p>`;

  for (const r of allResults) {
    const imgSrc = r.isBasic
      ? `faces_lowres/basic/${r.name.toLowerCase()}${r.sex}.jpg`
      : `faces_lowres/${r.name.toLowerCase()}${r.sex}.jpg`;

    const link = r.isBasic
      ? `http://humanphenotypes.net/basic/${r.name}.html`
      : `http://humanphenotypes.net/${r.name}.html`;

    resultsContainer.innerHTML += `
      <div>
        <a href="${link}" target="_blank">
          <img src="${imgSrc}" alt="${r.name}" onerror="this.src='placeholder.png'">
          <h3>${r.name}</h3>
          <span class="similarity">${r.similarity}% similarity</span>
        </a>
      </div>`;
  }
}

