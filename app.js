const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const TILE_SIZE = 256;
const RADAR_OPACITY = 0.6;
const FORECAST_OPACITY = 0.5;
const PLAY_INTERVAL_MS = 600;
const FORECAST_PAUSE_MS = 1200;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let map;
let radarOverlays = [];
let frames = [];
let currentFrame = 0;
let playing = false;
let playTimer = null;
let firstForecastIndex = -1;

const slider = document.getElementById("slider");
const timestampEl = document.getElementById("timestamp");
const badgeEl = document.getElementById("badge");
const btnPlay = document.getElementById("btn-play");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnForecast = document.getElementById("btn-forecast");
const btnLocate = document.getElementById("btn-locate");
const trackPast = document.getElementById("track-past");
const trackNow = document.getElementById("track-now");
const trackForecast = document.getElementById("track-forecast");

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 40.0, lng: -3.0 },
    zoom: 5,
    mapTypeId: "roadmap",
    styles: [
      { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
      { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
      { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
      { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
      { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
      { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
      { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
      { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
      { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
      { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
    ],
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  tryGeolocate();
  fetchRadarData();
}

function tryGeolocate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      map.setZoom(8);
    },
    () => {}
  );
}

function createRadarOverlay(tilePath, opacity) {
  const overlay = new google.maps.ImageMapType({
    getTileUrl: function (coord, zoom) {
      return `https://tilecache.rainviewer.com${tilePath}/${TILE_SIZE}/${zoom}/${coord.x}/${coord.y}/2/1_1.png`;
    },
    tileSize: new google.maps.Size(TILE_SIZE, TILE_SIZE),
    opacity: opacity,
    name: "radar",
  });
  return overlay;
}

async function fetchRadarData() {
  const res = await fetch(RAINVIEWER_API);
  const data = await res.json();

  const wasPlaying = playing;
  if (wasPlaying) stopPlay();

  frames = [];
  let pastCount = 0;
  let forecastCount = 0;

  let pastCount = 0;
  let forecastCount = 0;

  if (data.radar && data.radar.past) {
    data.radar.past.forEach((f) => {
      frames.push({ path: f.path, time: f.time, type: "past" });
      pastCount++;
    });
  }

  if (data.radar && data.radar.nowcast) {
    data.radar.nowcast.forEach((f) => {
      frames.push({ path: f.path, time: f.time, type: "forecast" });
      forecastCount++;
    });
  }

  if (frames.length === 0) return;

  firstForecastIndex = pastCount;
  updateTimelineTrack(pastCount, forecastCount);

  radarOverlays.forEach((overlay) => {
    map.overlayMapTypes.removeAt(0);
  });
  radarOverlays = [];

  frames.forEach((frame) => {
    const opacity = frame.type === "forecast" ? FORECAST_OPACITY : RADAR_OPACITY;
    const overlay = createRadarOverlay(frame.path, 0);
    radarOverlays.push(overlay);
  });

  slider.max = frames.length - 1;

  const lastPastIndex = Math.max(0, pastCount - 1);
  showFrame(lastPastIndex);

  setTimeout(() => startPlay(), 800);
}

function updateTimelineTrack(pastCount, forecastCount) {
  const total = pastCount + 1 + forecastCount;
  trackPast.style.width = `${(pastCount / total) * 100}%`;
  trackNow.style.width = `${(1 / total) * 100}%`;
  trackForecast.style.width = `${(forecastCount / total) * 100}%`;
}

function showFrame(index) {
  currentFrame = index;

  while (map.overlayMapTypes.getLength() > 0) {
    map.overlayMapTypes.removeAt(0);
  }

  const frame = frames[index];
  const opacity = frame.type === "forecast" ? FORECAST_OPACITY : RADAR_OPACITY;
  const overlay = createRadarOverlay(frame.path, opacity);
  map.overlayMapTypes.insertAt(0, overlay);

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
    badgeEl.textContent = "Coming Soon";
    badgeEl.classList.add("forecast");
  } else if (Math.abs(diffMin) <= 2) {
    badgeEl.textContent = "Live";
    badgeEl.classList.add("now");
  } else {
    badgeEl.textContent = "Past";
    badgeEl.classList.add("past");
  }
}

function advanceFrame() {
  const next = (currentFrame + 1) % frames.length;
  showFrame(next);

  if (playing && next === firstForecastIndex) {
    clearInterval(playTimer);
    playTimer = null;
    setTimeout(() => {
      if (playing) {
        playTimer = setInterval(advanceFrame, PLAY_INTERVAL_MS);
      }
    }, FORECAST_PAUSE_MS);
  }
}

function advanceFrame() {
  const next = (currentFrame + 1) % frames.length;
  showFrame(next);

  if (next === firstForecastIndex && playing) {
    clearInterval(playTimer);
    playTimer = null;
    setTimeout(() => {
      if (playing) {
        playTimer = setInterval(advanceFrame, PLAY_INTERVAL_MS);
      }
    }, FORECAST_PAUSE_MS);
  }
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
  playTimer = setInterval(advanceFrame, PLAY_INTERVAL_MS);
}

function stopPlay() {
  playing = false;
  btnPlay.textContent = "▶";
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function skipToForecast() {
  stopPlay();
  if (firstForecastIndex >= 0 && firstForecastIndex < frames.length) {
    showFrame(firstForecastIndex);
    setTimeout(() => startPlay(), 300);
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
  advanceFrame();
});
btnForecast.addEventListener("click", skipToForecast);
btnLocate.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      map.setZoom(9);
    },
    () => {
      alert("Could not get your location. Please allow location access.");
    }
  );
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") {
    stopPlay();
    advanceFrame();
  } else if (e.key === "ArrowLeft") {
    stopPlay();
    prevFrame();
  } else if (e.key === " ") {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "f" || e.key === "F") {
    skipToForecast();
  }
});

setInterval(fetchRadarData, REFRESH_INTERVAL_MS);
