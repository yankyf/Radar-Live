const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const TILE_SIZE = 256;
const RADAR_OPACITY = 0.55;
const FORECAST_OPACITY = 0.45;
const PLAY_INTERVAL_MS = 700;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let map;
let radarLayers = [];
let frames = [];
let currentFrame = 0;
let playing = false;
let playTimer = null;

const slider = document.getElementById("slider");
const timestampEl = document.getElementById("timestamp");
const badgeEl = document.getElementById("badge");
const btnPlay = document.getElementById("btn-play");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnLocate = document.getElementById("btn-locate");

function initMap() {
  map = L.map("map", {
    center: [40.0, -3.0],
    zoom: 5,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a> | Radar: <a href="https://www.rainviewer.com/">RainViewer</a>',
    subdomains: "abcd",
    maxZoom: 18,
  }).addTo(map);

  tryGeolocate();
}

function tryGeolocate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 8);
    },
    () => {}
  );
}

async function fetchRadarData() {
  const res = await fetch(RAINVIEWER_API);
  const data = await res.json();

  frames = [];

  if (data.radar && data.radar.past) {
    data.radar.past.forEach((f) => {
      frames.push({ path: f.path, time: f.time, type: "past" });
    });
  }

  if (data.radar && data.radar.nowcast) {
    data.radar.nowcast.forEach((f) => {
      frames.push({ path: f.path, time: f.time, type: "forecast" });
    });
  }

  if (frames.length === 0) return;

  radarLayers.forEach((layer) => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  radarLayers = [];

  frames.forEach((frame) => {
    const layer = L.tileLayer(
      `https://tilecache.rainviewer.com${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/2/1_1.png`,
      {
        tileSize: TILE_SIZE,
        opacity: 0,
        zIndex: 5,
      }
    );
    radarLayers.push(layer);
  });

  slider.max = frames.length - 1;

  const lastPastIndex = frames.reduce(
    (acc, f, i) => (f.type === "past" ? i : acc),
    0
  );
  showFrame(lastPastIndex);
}

function showFrame(index) {
  currentFrame = index;

  radarLayers.forEach((layer, i) => {
    if (i === index) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      const opacity =
        frames[i].type === "forecast" ? FORECAST_OPACITY : RADAR_OPACITY;
      layer.setOpacity(opacity);
    } else {
      if (map.hasLayer(layer)) layer.setOpacity(0);
    }
  });

  slider.value = index;
  updateTimestamp(index);
}

function updateTimestamp(index) {
  const frame = frames[index];
  if (!frame) return;

  const date = new Date(frame.time * 1000);
  const now = new Date();
  const diffMin = Math.round((date - now) / 60000);

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  let relativeStr = "";
  if (Math.abs(diffMin) <= 2) {
    relativeStr = "Now";
  } else if (diffMin < 0) {
    relativeStr = `${Math.abs(diffMin)} min ago`;
  } else {
    relativeStr = `in ${diffMin} min`;
  }

  timestampEl.textContent = `${dateStr}, ${timeStr}  ·  ${relativeStr}`;

  badgeEl.className = "";
  if (frame.type === "forecast") {
    badgeEl.textContent = "Forecast";
    badgeEl.classList.add("forecast");
  } else if (Math.abs(diffMin) <= 2) {
    badgeEl.textContent = "Live";
    badgeEl.classList.add("now");
  } else {
    badgeEl.textContent = "Past";
    badgeEl.classList.add("past");
  }
}

function nextFrame() {
  const next = (currentFrame + 1) % frames.length;
  showFrame(next);
}

function prevFrame() {
  const prev = (currentFrame - 1 + frames.length) % frames.length;
  showFrame(prev);
}

function togglePlay() {
  if (playing) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  playing = true;
  btnPlay.textContent = "⏸";
  playTimer = setInterval(nextFrame, PLAY_INTERVAL_MS);
}

function stopPlay() {
  playing = false;
  btnPlay.textContent = "▶";
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

slider.addEventListener("input", () => {
  stopPlay();
  showFrame(parseInt(slider.value, 10));
});

btnPlay.addEventListener("click", togglePlay);
btnPrev.addEventListener("click", () => {
  stopPlay();
  prevFrame();
});
btnNext.addEventListener("click", () => {
  stopPlay();
  nextFrame();
});
btnLocate.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 9);
    },
    () => {
      alert("Could not get your location. Please allow location access.");
    }
  );
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") {
    stopPlay();
    nextFrame();
  } else if (e.key === "ArrowLeft") {
    stopPlay();
    prevFrame();
  } else if (e.key === " ") {
    e.preventDefault();
    togglePlay();
  }
});

initMap();
fetchRadarData();

setInterval(fetchRadarData, REFRESH_INTERVAL_MS);
