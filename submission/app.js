const skipButton = document.getElementById("skipButton");
const gameOverlay = document.getElementById("gameOverlay");
const panel = document.getElementById("panel");
const humanIcon = document.getElementById("humanIcon");
const fillButton = document.getElementById("fillButton");
const continueButton = document.getElementById("continueButton");
const holdButton = document.getElementById("holdButton");
const progressLabel = document.getElementById("progressLabel");
const statusText = document.getElementById("statusText");
const stageText = document.getElementById("stageText");
const alertBox = document.getElementById("alertBox");
const shapeStage = document.getElementById("shapeStage");
const shapeFill = document.getElementById("shapeFill");

const SHAPES = ["bar", "circle", "hexagon"];

/*
  FINAL_ACTION options:
  - "return_to_skip": closes back to the small Skip Ad button
  - "dismiss_widget": closes the interface entirely and leaves no Skip Ad button
*/
const FINAL_ACTION = "return_to_skip";

let progress = 0;
let clickCount = 0;
let finished = false;
let clickTimes = [];
let fastThresholdMs = 0;

let winsCurrent = 0;
let hasRevealedMultiStage = false;
let failCountSinceProgress = 0;

let shapeBag = [];
let currentShape = "bar";
let assistMode = false;

let holdTimer = null;
let holdInterval = null;
let holdStart = 0;
const HOLD_MS = 1560;
let holdMode = "restart";

let audioCtx = null;

skipButton.addEventListener("click", function () {
  ensureAudio();
  gameOverlay.classList.add("show");
  skipButton.style.display = "none";
  startSession();
});

fillButton.addEventListener("click", function () {
  if (finished || panel.classList.contains("bot-state")) {
    return;
  }

  ensureAudio();
  queueTapSound();

  const now = performance.now();
  clickTimes.push(now);

  if (clickTimes.length > 8) {
    clickTimes.shift();
  }

  if (!assistMode && isBotBurst()) {
    triggerBotDetected();
    return;
  }

  clickCount += 1;
  progress += getClickGain(clickCount);

  if (progress >= 100) {
    progress = 100;
    updateProgressUI();
    handleShapeSuccess();
    return;
  }

  statusText.textContent = hasRevealedMultiStage
    ? "Click naturally to continue verification."
    : "Click naturally to complete verification.";

  updateProgressUI();
});

continueButton.addEventListener("click", function () {
  ensureAudio();
  beginAttempt();
});

holdButton.addEventListener("pointerdown", startHoldAction);
holdButton.addEventListener("pointerup", cancelHoldAction);
holdButton.addEventListener("pointerleave", cancelHoldAction);
holdButton.addEventListener("pointercancel", cancelHoldAction);

function startSession() {
  winsCurrent = 0;
  hasRevealedMultiStage = false;
  failCountSinceProgress = 0;
  finished = false;
  refillShapeBag();
  setHumanState("neutral");
  beginAttempt();
}

function beginAttempt() {
  clearHoldTimers();
  panel.classList.remove("bot-state");
  alertBox.classList.add("hidden");

  fillButton.classList.remove("hidden");
  fillButton.disabled = false;
  fillButton.textContent = "Tap to Verify";

  continueButton.classList.add("hidden");

  holdButton.classList.add("hidden");
  holdButton.textContent = "Hold to Restart";
  setHoldButtonFill(0);
  holdMode = "restart";

  progress = 0;
  clickCount = 0;
  clickTimes = [];

  assistMode = failCountSinceProgress >= 2;
  fastThresholdMs = assistMode ? randomInt(340, 460) : randomInt(220, 320);

  currentShape = getNextShape();
  applyShape(currentShape);

  statusText.textContent = hasRevealedMultiStage
    ? "Click naturally to continue verification."
    : "Click naturally to complete verification.";

  if (winsCurrent === 1) {
    setHumanState("success");
  } else if (winsCurrent >= 2) {
    setHumanState("success-final");
  } else {
    setHumanState("neutral");
  }

  updateStageText();
  updateProgressUI();
}

function handleShapeSuccess() {
  playSuccessStinger();
  failCountSinceProgress = 0;

  if (!hasRevealedMultiStage || winsCurrent === 0) {
    hasRevealedMultiStage = true;
    winsCurrent = 1;
    setHumanState("success");
    statusText.textContent = "Verification accepted.";
    updateStageText();

    fillButton.classList.add("hidden");
    continueButton.classList.remove("hidden");
    continueButton.textContent = "Continue";
    return;
  }

  if (winsCurrent === 1) {
    winsCurrent = 2;
    setHumanState("success-final");
    statusText.textContent = "Final confirmation required.";
    updateStageText();

    fillButton.classList.add("hidden");
    continueButton.classList.add("hidden");

    holdMode = "finalize";
    holdButton.classList.remove("hidden");
    holdButton.textContent = "Hold to Finalize";
    setHoldButtonFill(0);
    return;
  }
}

function triggerBotDetected() {
  playBotBuzz();

  progress = 0;
  clickCount = 0;
  clickTimes = [];
  failCountSinceProgress += 1;

  if (hasRevealedMultiStage) {
    winsCurrent = 0;
  }

  setHumanState("neutral");

  panel.classList.add("bot-state");
  alertBox.classList.remove("hidden");

  fillButton.classList.add("hidden");
  continueButton.classList.add("hidden");

  holdMode = "restart";
  holdButton.classList.remove("hidden");
  holdButton.textContent = "Hold to Restart";
  setHoldButtonFill(0);

  statusText.textContent = "Rapid input pattern flagged.";
  updateStageText();
  updateProgressUI();
}

function getClickGain(count) {
  if (assistMode) {
    if (count === 1) return 38;
    if (count === 2) return 22;
    if (count === 3) return 12;
    if (count === 4) return 9;
    return 6;
  }

  if (count === 1) return 33;
  if (count === 2) return 16.5;
  if (count === 3) return 8.25;
  if (count === 4) return 6;
  if (count === 5) return 4;
  return 2.5;
}

function isBotBurst() {
  if (clickTimes.length < 3) {
    return false;
  }

  const intervals = [];
  for (let i = 1; i < clickTimes.length; i += 1) {
    intervals.push(clickTimes[i] - clickTimes[i - 1]);
  }

  const recent2 = intervals.slice(-2);
  const recent3 = intervals.slice(-3);
  const recent4 = intervals.slice(-4);

  const allRecent2TooFast =
    recent2.length === 2 &&
    recent2.every(function (ms) {
      return ms < fastThresholdMs - 20;
    });

  const allRecent3TooFast =
    recent3.length === 3 &&
    recent3.every(function (ms) {
      return ms < fastThresholdMs;
    });

  const avgRecent4 =
    recent4.length === 4
      ? recent4.reduce(function (sum, ms) {
          return sum + ms;
        }, 0) / 4
      : null;

  const veryLowAverage = avgRecent4 !== null && avgRecent4 < fastThresholdMs - 25;

  const lateStageFastSpam =
    progress >= 60 &&
    recent2.length === 2 &&
    recent2.every(function (ms) {
      return ms < fastThresholdMs + 10;
    });

  return allRecent2TooFast || allRecent3TooFast || veryLowAverage || lateStageFastSpam;
}

function applyShape(shapeName) {
  shapeStage.className = "shape-stage shape-" + shapeName;

  panel.classList.remove("bar-mode", "shape-mode");

  if (shapeName === "bar") {
    panel.classList.add("bar-mode");
    shapeFill.style.width = "0%";
    shapeFill.style.height = "100%";
  } else {
    panel.classList.add("shape-mode");
    shapeFill.style.width = "100%";
    shapeFill.style.height = "0%";
  }
}

function getNextShape() {
  if (shapeBag.length === 0) {
    refillShapeBag();
  }

  return shapeBag.shift();
}

function refillShapeBag() {
  const laterShapes = shuffleArray(["circle", "hexagon"]);
  shapeBag = ["bar", ...laterShapes];
}

function updateStageText() {
  if (!hasRevealedMultiStage) {
    stageText.classList.add("hidden");
    stageText.textContent = "";
    return;
  }

  stageText.classList.remove("hidden");
  stageText.textContent = `${winsCurrent} of 2 complete.`;
}

function updateProgressUI() {
  if (currentShape === "bar") {
    shapeFill.style.width = `${progress}%`;
    shapeFill.style.height = "100%";
  } else {
    shapeFill.style.width = "100%";
    shapeFill.style.height = `${progress}%`;
  }

  progressLabel.textContent = `${Math.round(progress)}%`;
}

function startHoldAction(event) {
  event.preventDefault();
  ensureAudio();

  clearHoldTimers();

  holdStart = performance.now();

  if (holdMode === "finalize") {
    holdButton.textContent = "Hold to Finalize 0%";
  } else {
    holdButton.textContent = "Hold to Restart 0%";
  }

  setHoldButtonFill(0);

  holdInterval = setInterval(function () {
    const elapsed = performance.now() - holdStart;
    const pct = Math.min(100, Math.floor((elapsed / HOLD_MS) * 100));

    if (holdMode === "finalize") {
      holdButton.textContent = `Hold to Finalize ${pct}%`;
    } else {
      holdButton.textContent = `Hold to Restart ${pct}%`;
    }

    setHoldButtonFill(pct);
  }, 30);

  holdTimer = setTimeout(function () {
    clearHoldTimers();

    if (holdMode === "finalize") {
      finalizeSession();
    } else {
      beginAttempt();
    }
  }, HOLD_MS);
}

function cancelHoldAction() {
  clearHoldTimers();

  if (holdMode === "finalize") {
    holdButton.textContent = "Hold to Finalize";
  } else {
    holdButton.textContent = "Hold to Restart";
  }

  setHoldButtonFill(0);
}

function clearHoldTimers() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
}

function setHoldButtonFill(percent) {
  const pct = Math.max(0, Math.min(100, percent));
  holdButton.style.background = `linear-gradient(90deg, rgba(134,239,172,0.95) 0%, rgba(34,197,94,0.98) ${pct}%, #1f2937 ${pct}%, #1f2937 100%)`;
}

function setHumanState(state) {
  humanIcon.classList.remove("success", "success-final");

  if (state === "success") {
    humanIcon.classList.add("success");
  }

  if (state === "success-final") {
    humanIcon.classList.add("success-final");
  }
}

function finalizeSession() {
  playFinalTone();
  statusText.textContent = "Final confirmation accepted.";

  setTimeout(function () {
    if (FINAL_ACTION === "dismiss_widget") {
      dismissWidget();
    } else {
      closeToSkipButton();
    }
  }, 450);
}

function closeToSkipButton() {
  clearHoldTimers();
  gameOverlay.classList.remove("show");
  skipButton.style.display = "block";
  resetSessionState();
}

function dismissWidget() {
  clearHoldTimers();
  gameOverlay.classList.remove("show");
  skipButton.style.display = "none";
  resetSessionState();
}

function resetSessionState() {
  winsCurrent = 0;
  hasRevealedMultiStage = false;
  failCountSinceProgress = 0;
  finished = false;
  clickTimes = [];
  assistMode = false;
  progress = 0;
  clickCount = 0;
  refillShapeBag();
  currentShape = "bar";
  setHumanState("neutral");

  panel.classList.remove("bot-state");
  alertBox.classList.add("hidden");

  fillButton.classList.remove("hidden");
  fillButton.disabled = false;
  fillButton.textContent = "Tap to Verify";

  continueButton.classList.add("hidden");

  holdButton.classList.add("hidden");
  holdButton.textContent = "Hold to Restart";
  setHoldButtonFill(0);
  holdMode = "restart";

  statusText.textContent = "Click naturally to complete verification.";
  updateStageText();
  applyShape("bar");
  updateProgressUI();
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* Audio */

function ensureAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone(freq, duration, type, delayMs, gainAmount) {
  if (!audioCtx) {
    return;
  }

  const startAt = audioCtx.currentTime + (delayMs / 1000);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(gainAmount, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function queueTapSound() {
  const delayMs = randomInt(35, 110);
  const freq = randomInt(560, 720);
  playTone(freq, 0.05, "triangle", delayMs, 0.04);
}

function playSuccessStinger() {
  playTone(720, 0.08, "triangle", 0, 0.04);
  playTone(960, 0.09, "triangle", 90, 0.04);
}

function playBotBuzz() {
  playTone(180, 0.10, "sawtooth", 0, 0.04);
  playTone(130, 0.12, "sawtooth", 80, 0.04);
}

function playFinalTone() {
  playTone(640, 0.08, "sine", 0, 0.035);
  playTone(820, 0.10, "sine", 90, 0.035);
}