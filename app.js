const seedData = window.FLASHCARD_SEED_DATA || { categories: [], cards: [] };
const STORAGE_KEY = "clinic-english-flashcards:v1";

const elements = {
  totalCount: document.querySelector("#totalCount"),
  reviewCount: document.querySelector("#reviewCount"),
  customCount: document.querySelector("#customCount"),
  categoryTabs: document.querySelector("#categoryTabs"),
  randomToggle: document.querySelector("#randomToggle"),
  reviewToggle: document.querySelector("#reviewToggle"),
  autoSpeakToggle: document.querySelector("#autoSpeakToggle"),
  voiceSelect: document.querySelector("#voiceSelect"),
  rateSlider: document.querySelector("#rateSlider"),
  rateValue: document.querySelector("#rateValue"),
  audioModeButton: document.querySelector("#audioModeButton"),
  practiceDelaySlider: document.querySelector("#practiceDelaySlider"),
  practiceDelayValue: document.querySelector("#practiceDelayValue"),
  audioModeStatus: document.querySelector("#audioModeStatus"),
  flashcard: document.querySelector("#flashcard"),
  cardCategory: document.querySelector("#cardCategory"),
  faceLabel: document.querySelector("#faceLabel"),
  cardText: document.querySelector("#cardText"),
  cardNote: document.querySelector("#cardNote"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  speakButton: document.querySelector("#speakButton"),
  shuffleButton: document.querySelector("#shuffleButton"),
  markAgain: document.querySelector("#markAgain"),
  cardSlider: document.querySelector("#cardSlider"),
  cardPosition: document.querySelector("#cardPosition"),
  addForm: document.querySelector("#addForm"),
  newCategory: document.querySelector("#newCategory"),
  categoryOptions: document.querySelector("#categoryOptions"),
  newJapanese: document.querySelector("#newJapanese"),
  newEnglish: document.querySelector("#newEnglish"),
  cardList: document.querySelector("#cardList"),
  clearMarksButton: document.querySelector("#clearMarksButton"),
};

let state = loadState();
let deck = [];
let order = [];
let currentIndex = 0;
let showingEnglish = false;
let voices = [];
let swipeStart = null;
let suppressNextClick = false;
let audioModeActive = false;
let audioModeTimer = null;
let audioModeCycle = 0;
let lastAudioModeActivation = 0;

function loadState() {
  const defaults = {
    selectedCategory: "all",
    random: false,
    reviewOnly: false,
    autoSpeak: true,
    voiceURI: "",
    speechRate: 1,
    practiceDelay: 5,
    customCards: [],
    marked: {},
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...defaults,
      ...saved,
      speechRate: clampSpeechRate(saved.speechRate),
      practiceDelay: clampPracticeDelay(saved.practiceDelay),
      customCards: Array.isArray(saved.customCards) ? saved.customCards : [],
      marked: saved.marked && typeof saved.marked === "object" ? saved.marked : {},
    };
  } catch {
    return defaults;
  }
}

function clampSpeechRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) {
    return 1;
  }
  return Math.min(1.5, Math.max(0.5, Math.round(rate * 10) / 10));
}

function clampPracticeDelay(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return 5;
  }
  return Math.min(10, Math.max(2, Math.round(seconds)));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The app still works without persistence when browser storage is blocked.
  }
}

function getAllCards() {
  return [...seedData.cards, ...state.customCards];
}

function getCategories() {
  const names = [...seedData.categories];
  for (const card of state.customCards) {
    if (!names.includes(card.category)) {
      names.push(card.category);
    }
  }
  return names;
}

function ensureSelectedCategory() {
  const categories = getCategories();
  if (state.selectedCategory !== "all" && !categories.includes(state.selectedCategory)) {
    state.selectedCategory = "all";
    saveState();
  }
}

function getFilteredCards() {
  ensureSelectedCategory();
  let cards = getAllCards();
  if (state.selectedCategory !== "all") {
    cards = cards.filter((card) => card.category === state.selectedCategory);
  }
  if (state.reviewOnly) {
    cards = cards.filter((card) => state.marked[card.id]);
  }
  return cards;
}

function getCurrentCard() {
  const currentId = order[currentIndex];
  return deck.find((card) => card.id === currentId) || null;
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function syncDeck(options = {}) {
  const previousCard = getCurrentCard();
  const preserveId = options.preserveId ?? previousCard?.id ?? "";
  const indexHint = Number.isInteger(options.indexHint) ? options.indexHint : currentIndex;
  deck = getFilteredCards();
  order = deck.map((card) => card.id);
  if (state.random) {
    order = shuffle(order);
  }

  const preservedIndex = preserveId ? order.indexOf(preserveId) : -1;
  if (preservedIndex >= 0) {
    currentIndex = preservedIndex;
  } else {
    currentIndex = Math.min(Math.max(indexHint, 0), Math.max(order.length - 1, 0));
  }

  showingEnglish = false;
  render();
  if (audioModeActive) {
    restartAudioMode();
  }
}

function render() {
  renderControls();
  renderSummary();
  renderCategoryTabs();
  renderCategoryOptions();
  renderCard();
  renderList();
}

function renderControls() {
  elements.randomToggle.checked = state.random;
  elements.reviewToggle.checked = state.reviewOnly;
  elements.autoSpeakToggle.checked = state.autoSpeak;
  elements.rateSlider.value = String(state.speechRate);
  elements.rateValue.textContent = `${state.speechRate.toFixed(1)}x`;
  elements.practiceDelaySlider.value = String(state.practiceDelay);
  elements.practiceDelayValue.textContent = `${state.practiceDelay}秒`;
  elements.audioModeButton.classList.toggle("is-active", audioModeActive);
  elements.audioModeButton.setAttribute("aria-pressed", String(audioModeActive));
  elements.audioModeButton.innerHTML = audioModeActive
    ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 5h4v14H6z" /><path d="M14 5h4v14h-4z" /></svg>停止'
    : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7-11-7Z" /></svg>音声モード';
}

function renderSummary() {
  const cards = getAllCards();
  const validIds = new Set(cards.map((card) => card.id));
  const reviewCount = Object.keys(state.marked).filter((id) => validIds.has(id)).length;
  elements.totalCount.textContent = String(cards.length);
  elements.reviewCount.textContent = String(reviewCount);
  elements.customCount.textContent = String(state.customCards.length);
}

function renderCategoryTabs() {
  const cards = getAllCards();
  const categories = getCategories();
  ensureSelectedCategory();

  const entries = [
    { id: "all", label: "すべて", count: cards.length },
    ...categories.map((category) => ({
      id: category,
      label: category,
      count: cards.filter((card) => card.category === category).length,
    })),
  ];

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-tab";
    if (entry.id === state.selectedCategory) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }
    button.textContent = `${entry.label} ${entry.count}`;
    button.addEventListener("click", () => {
      state.selectedCategory = entry.id;
      saveState();
      syncDeck({ preserveId: "" });
    });
    fragment.append(button);
  }
  elements.categoryTabs.replaceChildren(fragment);
}

function renderCategoryOptions() {
  const fragment = document.createDocumentFragment();
  for (const category of getCategories()) {
    const option = document.createElement("option");
    option.value = category;
    fragment.append(option);
  }
  elements.categoryOptions.replaceChildren(fragment);

  if (!elements.newCategory.value && document.activeElement !== elements.newCategory) {
    const fallback = state.selectedCategory === "all" ? getCategories()[0] : state.selectedCategory;
    elements.newCategory.value = fallback || "";
  }
}

function renderCard() {
  const card = getCurrentCard();
  const hasCard = Boolean(card);
  elements.flashcard.disabled = !hasCard;
  elements.prevButton.disabled = !hasCard || order.length < 2;
  elements.nextButton.disabled = !hasCard || order.length < 2;
  elements.speakButton.disabled = !hasCard;
  elements.shuffleButton.disabled = !hasCard || order.length < 2;
  elements.markAgain.disabled = !hasCard;
  elements.cardSlider.disabled = !hasCard || order.length < 2;
  elements.audioModeButton.disabled = !hasCard;

  elements.flashcard.classList.toggle("is-empty", !hasCard);
  elements.flashcard.classList.toggle("is-english", hasCard && showingEnglish);

  if (!hasCard) {
    elements.cardCategory.textContent = state.reviewOnly ? "もう一度" : "項目";
    elements.faceLabel.textContent = "";
    elements.cardText.textContent = state.reviewOnly ? "チェック済みのカードはありません" : "カードがありません";
    elements.cardNote.textContent = "";
    elements.markAgain.checked = false;
    elements.cardSlider.min = "1";
    elements.cardSlider.max = "1";
    elements.cardSlider.value = "1";
    elements.cardSlider.style.setProperty("--slider-fill", "0%");
    elements.cardPosition.textContent = "0 / 0";
    return;
  }

  const displayText = showingEnglish ? card.english : card.japanese;
  elements.cardCategory.textContent = card.category;
  elements.faceLabel.textContent = showingEnglish ? "English" : "日本語";
  elements.cardText.textContent = displayText;
  elements.cardNote.textContent = showingEnglish && card.note ? `別表現: ${card.note}` : "";
  elements.markAgain.checked = Boolean(state.marked[card.id]);
  elements.cardSlider.min = "1";
  elements.cardSlider.max = String(order.length);
  elements.cardSlider.value = String(currentIndex + 1);
  elements.cardSlider.style.setProperty("--slider-fill", `${order.length > 1 ? (currentIndex / (order.length - 1)) * 100 : 0}%`);
  elements.cardPosition.textContent = `${currentIndex + 1} / ${order.length}`;
}

function renderList() {
  const current = getCurrentCard();
  const cards = getFilteredCards();
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = state.reviewOnly ? "チェック済みのカードはありません" : "カードがありません";
    elements.cardList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const card of cards) {
    const item = document.createElement("div");
    item.className = "list-item";
    if (current?.id === card.id) {
      item.classList.add("is-active");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(state.marked[card.id]);
    checkbox.setAttribute("aria-label", "もう一度");
    checkbox.addEventListener("change", () => {
      setMarked(card.id, checkbox.checked, { indexHint: currentIndex });
    });

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "list-copy";
    copy.addEventListener("click", () => {
      const targetIndex = order.indexOf(card.id);
      if (targetIndex >= 0) {
        currentIndex = targetIndex;
        showingEnglish = false;
        render();
      }
    });

    const japanese = document.createElement("strong");
    japanese.textContent = card.japanese;
    const english = document.createElement("span");
    english.textContent = card.english;
    copy.append(japanese, english);

    item.append(checkbox, copy);
    if (card.source === "custom") {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-button";
      deleteButton.setAttribute("aria-label", "削除");
      deleteButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>';
      deleteButton.addEventListener("click", () => deleteCustomCard(card.id));
      item.append(deleteButton);
    } else {
      const spacer = document.createElement("span");
      spacer.setAttribute("aria-hidden", "true");
      item.append(spacer);
    }
    fragment.append(item);
  }
  elements.cardList.replaceChildren(fragment);
}

function flipCard() {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  if (!getCurrentCard()) {
    return;
  }
  showingEnglish = !showingEnglish;
  renderCard();
  if (showingEnglish && state.autoSpeak) {
    speakCurrent();
  }
}

function moveCard(step, options = {}) {
  if (!order.length) {
    return;
  }
  currentIndex = (currentIndex + step + order.length) % order.length;
  showingEnglish = false;
  render();
  if (audioModeActive && options.restartAudio !== false) {
    restartAudioMode();
  }
}

function startCardSwipe(event) {
  if (!getCurrentCard()) {
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  swipeStart = {
    x: event.clientX,
    y: event.clientY,
    time: Date.now(),
    pointerId: event.pointerId,
  };
  elements.flashcard.setPointerCapture?.(event.pointerId);
}

function finishCardSwipe(event) {
  if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
    return;
  }
  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  const elapsed = Date.now() - swipeStart.time;
  swipeStart = null;

  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  const threshold = Math.max(48, elements.flashcard.clientWidth * 0.12);
  const isSwipe = horizontal >= threshold && horizontal > vertical * 1.35 && elapsed < 900;

  if (!isSwipe) {
    return;
  }

  suppressNextClick = true;
  event.preventDefault();
  moveCard(deltaX < 0 ? 1 : -1);
  window.setTimeout(() => {
    suppressNextClick = false;
  }, 120);
}

function cancelCardSwipe(event) {
  if (swipeStart?.pointerId === event.pointerId) {
    swipeStart = null;
  }
}

function jumpToCard(value) {
  if (!order.length) {
    return;
  }
  const nextIndex = Number(value) - 1;
  if (!Number.isInteger(nextIndex)) {
    return;
  }
  currentIndex = Math.min(Math.max(nextIndex, 0), order.length - 1);
  showingEnglish = false;
  render();
  if (audioModeActive) {
    restartAudioMode();
  }
}

function setMarked(id, checked, options = {}) {
  if (checked) {
    state.marked[id] = true;
  } else {
    delete state.marked[id];
  }
  saveState();
  if (state.reviewOnly && !checked) {
    syncDeck({ preserveId: "", indexHint: options.indexHint ?? currentIndex });
  } else {
    render();
  }
}

function deleteCustomCard(id) {
  state.customCards = state.customCards.filter((card) => card.id !== id);
  delete state.marked[id];
  saveState();
  syncDeck({ preserveId: "" });
}

function addCard(event) {
  event.preventDefault();
  const category = elements.newCategory.value.trim();
  const japanese = elements.newJapanese.value.trim();
  const english = elements.newEnglish.value.trim();
  if (!category || !japanese || !english) {
    return;
  }

  const card = {
    id: `custom-${Date.now()}`,
    category,
    japanese,
    english,
    source: "custom",
  };

  state.customCards.push(card);
  state.selectedCategory = category;
  state.reviewOnly = false;
  saveState();
  elements.newJapanese.value = "";
  elements.newEnglish.value = "";
  syncDeck({ preserveId: card.id });
}

function clearMarks() {
  state.marked = {};
  saveState();
  syncDeck({ preserveId: "" });
}

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    voices = [];
    renderVoiceOptions();
    return;
  }
  voices = window.speechSynthesis.getVoices();
  renderVoiceOptions();
}

function voiceScore(voice) {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase() === "en-us") score += 4;
  if (voice.lang.toLowerCase().startsWith("en-gb")) score += 2;
  if (/samantha|victoria|allison|ava|jenny|aria|emma|zira|serena|susan|karen|moira|tessa/.test(name)) score += 10;
  if (/google us english|google uk english female|microsoft aria|microsoft jenny/.test(name)) score += 7;
  if (/female|woman/.test(name)) score += 5;
  if (!voice.localService) score += 1;
  return score;
}

function getPreferredVoice() {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  if (!englishVoices.length) {
    return null;
  }
  const saved = englishVoices.find((voice) => voice.voiceURI === state.voiceURI);
  if (saved) {
    return saved;
  }
  return [...englishVoices].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

function getJapaneseVoice() {
  const japaneseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (!japaneseVoices.length) {
    return null;
  }
  return [...japaneseVoices].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aScore = /kyoko|otoya|google|japanese|日本/.test(aName) ? 2 : 0;
    const bScore = /kyoko|otoya|google|japanese|日本/.test(bName) ? 2 : 0;
    return bScore - aScore;
  })[0];
}

function renderVoiceOptions() {
  const fragment = document.createDocumentFragment();

  if (!("speechSynthesis" in window)) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "非対応";
    fragment.append(option);
    elements.voiceSelect.disabled = true;
    elements.voiceSelect.replaceChildren(fragment);
    return;
  }

  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  if (!englishVoices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "読み込み中";
    fragment.append(option);
    elements.voiceSelect.disabled = true;
    elements.voiceSelect.replaceChildren(fragment);
    return;
  }

  elements.voiceSelect.disabled = false;
  const preferred = getPreferredVoice();
  for (const voice of englishVoices) {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (preferred && voice.voiceURI === preferred.voiceURI) {
      option.selected = true;
    }
    fragment.append(option);
  }
  elements.voiceSelect.replaceChildren(fragment);
}

function speakCurrent() {
  const card = getCurrentCard();
  if (!card) {
    return;
  }
  speak(card.english);
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve();
  }
  const voice = getPreferredVoice();
  return speakWithVoice(text, {
    cancelBefore: true,
    lang: voice?.lang || "en-US",
    voice,
    rate: state.speechRate,
    pitch: 1.08,
  });
}

function estimateSpeechTimeout(text, options = {}) {
  const length = String(text || "").length;
  const rate = Number(options.rate) || 1;
  const isJapanese = String(options.lang || "").toLowerCase().startsWith("ja");
  const perChar = isJapanese ? 170 : 95;
  return Math.min(30000, Math.max(3500, 1400 + (length * perChar) / rate));
}

function cancelSpeech() {
  if (!("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
}

function speakWithVoice(text, options = {}) {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang || "en-US";
  utterance.voice = options.voice || null;
  utterance.rate = options.rate || state.speechRate;
  utterance.pitch = options.pitch || 1;
  utterance.volume = 1;
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    }, estimateSpeechTimeout(text, options));

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    try {
      if (options.cancelBefore) {
        window.speechSynthesis.cancel();
      }
      if (typeof window.speechSynthesis.resume === "function") {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  });
}

function setAudioModeStatus(text) {
  elements.audioModeStatus.textContent = text;
}

function clearAudioModeTimer() {
  if (audioModeTimer) {
    window.clearTimeout(audioModeTimer);
    audioModeTimer = null;
  }
}

function waitForPracticeTime(cycle) {
  clearAudioModeTimer();
  return new Promise((resolve) => {
    audioModeTimer = window.setTimeout(() => {
      audioModeTimer = null;
      resolve();
    }, state.practiceDelay * 1000);
  }).then(() => audioModeActive && cycle === audioModeCycle);
}

function startAudioMode() {
  if (!getCurrentCard()) {
    return;
  }
  loadVoices();
  audioModeActive = true;
  cancelSpeech();
  setAudioModeStatus("準備中");
  renderControls();
  runAudioModeCycle();
}

function stopAudioMode() {
  audioModeActive = false;
  audioModeCycle += 1;
  clearAudioModeTimer();
  cancelSpeech();
  setAudioModeStatus("停止中");
  renderControls();
}

function restartAudioMode() {
  if (!audioModeActive) {
    return;
  }
  audioModeCycle += 1;
  clearAudioModeTimer();
  cancelSpeech();
  window.setTimeout(runAudioModeCycle, 80);
}

async function runAudioModeCycle() {
  const card = getCurrentCard();
  if (!audioModeActive || !card) {
    stopAudioMode();
    return;
  }

  const cycle = audioModeCycle + 1;
  audioModeCycle = cycle;
  showingEnglish = false;
  render();

  setAudioModeStatus("日本語");
  const japaneseVoice = getJapaneseVoice();
  await speakWithVoice(card.japanese, {
    lang: japaneseVoice?.lang || "ja-JP",
    voice: japaneseVoice,
    rate: state.speechRate,
    pitch: 1,
  });
  if (!audioModeActive || cycle !== audioModeCycle) {
    return;
  }

  setAudioModeStatus(`発声 ${state.practiceDelay}秒`);
  const canContinue = await waitForPracticeTime(cycle);
  if (!canContinue) {
    return;
  }

  showingEnglish = true;
  renderCard();
  setAudioModeStatus("English");
  const englishVoice = getPreferredVoice();
  await speakWithVoice(card.english, {
    lang: englishVoice?.lang || "en-US",
    voice: englishVoice,
    rate: state.speechRate,
    pitch: 1.08,
  });
  if (!audioModeActive || cycle !== audioModeCycle) {
    return;
  }

  moveCard(1, { restartAudio: false });
  if (!audioModeActive || cycle !== audioModeCycle) {
    return;
  }

  setAudioModeStatus("次へ");
  clearAudioModeTimer();
  audioModeTimer = window.setTimeout(runAudioModeCycle, 450);
}

function toggleAudioMode() {
  if (audioModeActive) {
    stopAudioMode();
  } else {
    startAudioMode();
  }
}

function handleAudioModeActivation(event) {
  const now = Date.now();
  if (now - lastAudioModeActivation < 450) {
    return;
  }
  lastAudioModeActivation = now;
  if (event?.cancelable) {
    event.preventDefault();
  }
  toggleAudioMode();
}

function attachEvents() {
  elements.flashcard.addEventListener("click", flipCard);
  elements.flashcard.addEventListener("pointerdown", startCardSwipe);
  elements.flashcard.addEventListener("pointerup", finishCardSwipe);
  elements.flashcard.addEventListener("pointercancel", cancelCardSwipe);
  elements.flashcard.addEventListener("lostpointercapture", cancelCardSwipe);
  elements.audioModeButton.addEventListener("click", handleAudioModeActivation);
  elements.audioModeButton.addEventListener("touchend", handleAudioModeActivation, { passive: false });
  elements.audioModeButton.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") {
      handleAudioModeActivation(event);
    }
  });
  elements.speakButton.addEventListener("click", speakCurrent);
  elements.prevButton.addEventListener("click", () => moveCard(-1));
  elements.nextButton.addEventListener("click", () => moveCard(1));
  elements.shuffleButton.addEventListener("click", () => {
    state.random = true;
    saveState();
    syncDeck({ preserveId: "" });
  });
  elements.markAgain.addEventListener("change", () => {
    const card = getCurrentCard();
    if (card) {
      setMarked(card.id, elements.markAgain.checked, { indexHint: currentIndex });
    }
  });
  elements.randomToggle.addEventListener("change", () => {
    state.random = elements.randomToggle.checked;
    saveState();
    syncDeck({ preserveId: getCurrentCard()?.id || "" });
  });
  elements.reviewToggle.addEventListener("change", () => {
    state.reviewOnly = elements.reviewToggle.checked;
    saveState();
    syncDeck({ preserveId: "" });
  });
  elements.autoSpeakToggle.addEventListener("change", () => {
    state.autoSpeak = elements.autoSpeakToggle.checked;
    saveState();
  });
  elements.voiceSelect.addEventListener("change", () => {
    state.voiceURI = elements.voiceSelect.value;
    saveState();
  });
  elements.rateSlider.addEventListener("input", () => {
    state.speechRate = clampSpeechRate(elements.rateSlider.value);
    elements.rateValue.textContent = `${state.speechRate.toFixed(1)}x`;
    saveState();
    if (audioModeActive) {
      restartAudioMode();
    }
  });
  elements.practiceDelaySlider.addEventListener("input", () => {
    state.practiceDelay = clampPracticeDelay(elements.practiceDelaySlider.value);
    elements.practiceDelayValue.textContent = `${state.practiceDelay}秒`;
    saveState();
    if (audioModeActive) {
      restartAudioMode();
    }
  });
  elements.cardSlider.addEventListener("input", () => {
    jumpToCard(elements.cardSlider.value);
  });
  elements.addForm.addEventListener("submit", addCard);
  elements.clearMarksButton.addEventListener("click", clearMarks);
  window.addEventListener("beforeunload", () => {
    cancelSpeech();
    clearAudioModeTimer();
  });
}

attachEvents();
syncDeck({ preserveId: "" });
loadVoices();

if ("speechSynthesis" in window) {
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  } else {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}
