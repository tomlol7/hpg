let list;
const loading = document.getElementById('loading');
const imgContainer = document.getElementById('imgContainer');

async function displayImg(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  imgContainer.replaceChildren(img);
}

const dot = (a, b) => a.reduce((acc, n, i) => acc + n * b[i], 0);
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));

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

  // ---------------------------
  // Gender handling
  // ---------------------------
  let sex;
  const genderProbability = detection.genderProbability * 100;

  if (genderProbability >= 50) {
    // Automatically assign gender
    sex = detection.gender === 'female' ? 'f' : 'm';
    loading.textContent = `Gender detected: ${detection.gender.charAt(0).toUpperCase() + detection.gender.slice(1)}`;
  } else {
    // Ask for confirmation if < 50%
    if (
      confirm(
        `The program thinks you are ${detection.gender} with ${Math.round(genderProbability)}% confidence. Is this correct?`
      )
    ) {
      sex = detection.gender.substring(0, 1);
    } else {
      sex = detection.gender === 'female' ? 'm' : 'f';
    }
  }

  const iSex = sex === 'm' ? 1 : 2;

  // ---------------------------
  // Similarity calculations
  // ---------------------------
  let list2 = structuredClone(list);
  for (let j = 0; j < list2.length; j++) {
    const len2 = list2[j].length;
    if (len2 > 1) {
      list2[j][0][iSex] = cos(list2[j][0][iSex], detection.descriptor) * 100;
    }
    if (Array.isArray(list2[j][len2 - 1])) {
      for (let k = 0; k < list2[j][len2 - 1].length; k++) {
        list2[j][len2 - 1][k][iSex] =
          cos(list2[j][len2 - 1][k][iSex], detection.descriptor) * 100;
      }
      list2[j][len2 - 1].sort((a, b) => b[iSex] - a[iSex]);
    }
  }

  function grpScore(a) {
    if (a.length > 1 && Array.isArray(a[1])) {
      return Math.max(a[0][iSex], a[1][0][iSex]);
    }
    return a[0][iSex];
  }

  list2.sort((a, b) => grpScore(b) - grpScore(a));

  loading.textContent = `Gender: ${sex === 'm' ? 'Male' : 'Female'} | Results below!`;

  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.innerHTML = `<h2>Top Match Results</h2>`;

  // --- Top match ---
  const top = list2[0];
  const topName = top[0][0];
  const topScore = Math.round(top[0][iSex]);

  resultsContainer.innerHTML += `
    <div class="top-match">
      <img src="faces_lowres/basic/${topName.toLowerCase()}${sex}.jpg">
      <div>
        <a href="http://humanphenotypes.net/basic/${topName}.html"><h3>${topName}</h3></a>
        <span class="similarity">${topScore}%</span> similarity
      </div>
    </div>
  `;

  // --- Other 10 matches ---
  resultsContainer.innerHTML += `<div class="other-matches">`;
  let displayedCount = 0;

  for (let g = 1; g < list2.length; g++) {
    const group = list2[g];
    const len = group.length;

    // main match in group
    if (len > 1 && displayedCount < 10) {
      const name = group[0][0];
      const score = Math.round(group[0][iSex]);
      resultsContainer.innerHTML += `
        <div class="card">
          <img src="faces_lowres/basic/${name.toLowerCase()}${sex}.jpg">
          <div>
            <a href="http://humanphenotypes.net/basic/${name}.html"><h3>${name}</h3></a>
            <span class="similarity">${score}%</span> similarity
          </div>
        </div>`;
      displayedCount++;
    }

    // nested matches if exist
    if (Array.isArray(group[len - 1])) {
      for (const arr of group[len - 1]) {
        if (displayedCount >= 10) break;
        const name = arr[0];
        const score = Math.round(arr[iSex]);
        resultsContainer.innerHTML += `
          <div class="card">
            <img src="faces_lowres/${name.toLowerCase()}${sex}.jpg">
            <div>
              <a href="http://humanphenotypes.net/${name}.html"><h3>${name}</h3></a>
              <span class="similarity">${score}%</span> similarity
            </div>
          </div>`;
        displayedCount++;
      }
    }

    if (displayedCount >= 10) break;
  }

  resultsContainer.innerHTML += `</div>`; // close other-matches
}

document.getElementById('imgInp').onchange = async function () {
  const [file] = this.files;
  if (file) {
    await displayImg(URL.createObjectURL(file));
    if (document.getElementById('loader') == null) analyze();
  }
};

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
    if (len > 1) list[i][0] = hexToF32(list[i][0]);
    if (Array.isArray(list[i][len - 1])) {
      for (let j = 0; j < list[i][len - 1].length; j++) {
        list[i][len - 1][j] = hexToF32(list[i][len - 1][j]);
      }
    }
  }

  loading.textContent = 'Models fetched!';
  const loader = document.getElementById('loader');
  if (loader) loader.remove();

  if (imgContainer.children.length > 0) analyze();
})();
