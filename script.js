/* script.js - full, robust version
   - fixes binary -> Float32 parsing
   - auto gender >= 50%
   - shows top 1 (center) + 10 others (grid)
   - safer structuredClone fallback and try/catch reporting
*/

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
  try {
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
    const genderProb = detection.genderProbability * 100;

    if (genderProb >= 50) {
      sex = detection.gender === 'female' ? 'f' : 'm';
      loading.textContent = `Gender: ${detection.gender.charAt(0).toUpperCase() + detection.gender.slice(1)}`;
    } else {
      if (
        confirm(
          `The program thinks you are ${detection.gender} with ${Math.round(genderProb)}% confidence. Is this correct?`
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
    let list2;
    if (typeof structuredClone === 'function') {
      list2 = structuredClone(list);
    } else {
      list2 = JSON.parse(JSON.stringify(list));
    }

    for (let j = 0; j < list2.length; j++) {
      const len2 = list2[j].length;
      if (len2 > 1) {
        try {
          list2[j][0][iSex] = cos(list2[j][0][iSex], detection.descriptor) * 100;
        } catch (e) {
          console.warn('Bad main vector at group', j, e);
        }
      }

      const nested = list2[j][len2 - 1];
      if (Array.isArray(nested)) {
        for (let k = 0; k < nested.length; k++) {
          try {
            nested[k][iSex] = cos(nested[k][iSex], detection.descriptor) * 100;
          } catch (e) {
            console.warn('Bad nested vector at group', j, 'index', k, e);
          }
        }
        nested.sort((a, b) => b[iSex] - a[iSex]);
      }
    }

    function grpScore(a) {
      if (!Array.isArray(a)) return -Infinity;
      if (a.length > 1 && Array.isArray(a[1]) && a[1].length > 0) {
        return Math.max(a[0][iSex] || 0, a[1][0][iSex] || 0);
      }
      return a[0] && a[0][iSex] ? a[0][iSex] : 0;
    }

    list2.sort((a, b) => grpScore(b) - grpScore(a));

    if (!Array.isArray(list2) || list2.length === 0) {
      loading.textContent = 'No phenotype data loaded.';
      return;
    }

    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = `<h2>Top Match Results</h2>`;

    // --- Top match ---
    const top = list2[0];
    const topName = (top && top[0] && top[0][0]) ? top[0][0] : 'Unknown';
    const topScore = top && top[0] && top[0][iSex] ? Math.round(top[0][iSex]) : 0;

    resultsContainer.innerHTML += `
      <div class="top-match">
        <img src="faces_lowres/basic/${topName.toLowerCase()}${sex}.jpg" alt="${topName}">
        <div>
          <a href="http://humanphenotypes.net/basic/${topName}.html"><h3>${topName}</h3></a>
          <span class="similarity">${topScore}%</span> similarity
        </div>
      </div>
    `;

    // --- Other 10 matches ---
    resultsContainer.innerHTML += `<div class="other-matches">`;
    let displayedCount = 0;

    for (let g = 1; g < list2.length && displayedCount < 10; g++) {
      const group = list2[g];
      if (!group) continue;
      const len = group.length;

      if (len > 1 && group[0]) {
        const name = group[0][0] || 'Unknown';
        const score = group[0][iSex] ? Math.round(group[0][iSex]) : 0;
        resultsContainer.innerHTML += `
          <div class="card">
            <img src="faces_lowres/basic/${name.toLowerCase()}${sex}.jpg" alt="${name}">
            <div>
              <a href="http://humanphenotypes.net/basic/${name}.html"><h3>${name}</h3></a>
              <span class="similarity">${score}%</span> similarity
            </div>
          </div>`;
        displayedCount++;
        if (displayedCount >= 10) break;
      }

      const nested = group[len - 1];
      if (Array.isArray(nested)) {
        for (let n = 0; n < nested.length && displayedCount < 10; n++) {
          const arr = nested[n];
          if (!arr) continue;
          const name = arr[0] || 'Unknown';
          const score = arr[iSex] ? Math.round(arr[iSex]) : 0;
          resultsContainer.innerHTML += `
            <div class="card">
              <img src="faces_lowres/${name.toLowerCase()}${sex}.jpg" alt="${name}">
              <div>
                <a href="http://humanphenotypes.net/${name}.html"><h3>${name}</h3></a>
                <span class="similarity">${score}%</span> similarity
              </div>
            </div>`;
          displayedCount++;
        }
      }
    }

    resultsContainer.innerHTML += `</div>`;
    loading.textContent = `Gender: ${sex === 'm' ? 'Male' : 'Female'} | Results ready`;
  } catch (err) {
    console.error('Analyze error:', err);
    loading.textContent = 'An error occurred while analyzing — check console.';
  }
}

// wire file input
document.getElementById('imgInp').onchange = async function () {
  const [file] = this.files;
  if (file) {
    await displayImg(URL.createObjectURL(file));
    if (!document.getElementById('loader')) analyze();
  }
};

// initialize models & dataset
(async () => {
  try {
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
        try {
          list[i][0] = hexToF32(list[i][0]);
        } catch (e) {
          console.warn('Failed parse main vector for group', i, e);
        }
      }
      if (Array.isArray(list[i][len - 1])) {
        for (let j = 0; j < list[i][len - 1].length; j++) {
          try {
            list[i][len - 1][j] = hexToF32(list[i][len - 1][j]);
          } catch (e) {
            console.warn('Failed parse nested vector', i, j, e);
          }
        }
      }
    }

    loading.textContent = 'Models fetched!';
    const loader = document.getElementById('loader');
    if (loader) loader.remove();

    if (imgContainer.children.length > 0) analyze();
  } catch (err) {
    console.error('Init error:', err);
    loading.textContent = 'Failed to load models or data. Check console.';
  }
})();
