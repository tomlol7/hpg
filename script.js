let list;
const loading = document.getElementById('loading');
const imgContainer = document.getElementById('imgContainer');

async function displayImg(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  imgContainer.replaceChildren(img);
}

dot = (a, b) => a.reduce((acc, n, i) => acc + (n * b[i]), 0);
cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));

async function analyze() {
  loading.textContent = 'Analyzing the image. . .';
  const detection = await faceapi
    .detectSingleFace(imgContainer.firstChild)
    .withFaceLandmarks()
    .withAgeAndGender()
    .withFaceDescriptor();

  if (detection === undefined) {
    loading.textContent = 'No face detected. Try another image.';
    return;
  }

  const desc = detection.descriptor;
  let sex = detection.gender;
  if (
    confirm(
      `The program thinks you are ${sex} with ${(detection.genderProbability * 100).toFixed(
        0
      )}% confidence. Is this correct?`
    )
  ) {
    sex = sex.substring(0, 1);
  } else {
    sex = sex == 'female' ? 'm' : 'f';
  }
  const i = sex == 'm' ? 1 : 2;

  let list2 = structuredClone(list);
  for (let j = 0; j < list2.length; j++) {
    const len2 = list2[j].length;
    if (len2 > 1) {
      list2[j][0][i] = cos(list2[j][0][i], desc) * 100;
    }
    for (let k = 0; k < list2[j][len2 - 1].length; k++) {
      list2[j][len2 - 1][k][i] = cos(list2[j][len2 - 1][k][i], desc) * 100;
    }
    list2[j][len2 - 1].sort(function (a, b) {
      return b[i] - a[i];
    });
  }

  function grpScore(a) {
    if (a.length > 1) {
      return Math.max(a[0][i], a[1][0][i]);
    }
    return a[0][0][i];
  }
  list2.sort(function (a, b) {
    return grpScore(b) - grpScore(a);
  });

  // ✅ Keep only top 10
  list2 = list2.slice(0, 10);

  loading.textContent = 'Results!';
  console.log('Match Results');
  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.innerHTML = `<br>
    <p>
      <h2>Top 10 Match Results</h2>
      <br>
      These are the top 10 phenotypes that most closely match your uploaded image.
      <br>
    </p>`;

  for (const a of list2) {
    console.log(' ');
    resultsContainer.innerHTML += `<br>`;
    const aLen = a.length;
    if (aLen > 1) {
      console.log(`${a[0][0]}: ${Math.round(a[0][i])}%`);
      resultsContainer.innerHTML += `<div>
        <img src="faces_lowres/basic/${a[0][0].toLowerCase()}${sex}.jpg">
        <div>
          <a href="http://humanphenotypes.net/basic/${a[0][0]}.html"><h3>${a[0][0]}</h3></a>
          ${Math.round(a[0][i])}% similarity
        </div>
      </div>`;
    }
    for (const arr of a[aLen - 1]) {
      console.log(`    ${arr[0]}: ${Math.round(arr[i])}%`);
      resultsContainer.innerHTML += `<div>
        <img src="faces_lowres/${arr[0].toLowerCase()}${sex}.jpg" style="margin-left: 30px">
        <div>
          <a href="http://humanphenotypes.net/${arr[0]}.html"><h3>${arr[0]}</h3></a>
          ${Math.round(arr[i])}% similarity
        </div>
      </div>`;
    }
  }
}

document.getElementById('imgInp').onchange = async function () {
  const [file] = this.files;
  if (file) {
    await displayImg(URL.createObjectURL(file));
    if (document.getElementById('loader') == null) analyze();
  }
};

(async () => {
  // ✅ relative paths so it works locally & on GitHub Pages
  await faceapi.loadSsdMobilenetv1Model('models');
  await faceapi.loadFaceLandmarkModel('models');
  await faceapi.loadFaceRecognitionModel('models');
  await faceapi.loadAgeGenderModel('models');

  const response = await fetch('list.json');
  const text = await response.text();
  list = JSON.parse(text);

  hexToF32Arr = (str) =>
    new Float32Array(
      new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0))).buffer
    );
  hexToF32 = (arr) => [arr[0], hexToF32Arr(arr[1]), hexToF32Arr(arr[2])];

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
  document.getElementById('loader').remove();
  if (imgContainer.children.length > 0) analyze();
})();
