const gacha = document.getElementById("gacha");
const stateEl = document.getElementById("state");
const stockEl = document.getElementById("stock");
const historyEl = document.getElementById("history");
const setNote = document.getElementById("set-note");
const coinBox = document.getElementById("require-coin");
const coinButton = document.getElementById("coin");
const turnButton = document.getElementById("turn");
const muteButton = document.getElementById("mute");

// ---- prize sets: all content lives here, in the host ----

const slip = (text, sign) => {
  const el = document.createElement("article");
  el.className = "prize-slip";
  el.innerHTML = '<p class="slip-sign"></p><p class="slip-text"></p><p class="slip-foot">— keep this somewhere you\'ll find it —</p>';
  el.querySelector(".slip-sign").textContent = sign;
  el.querySelector(".slip-text").textContent = text;
  return el;
};

const sets = {
  objects: {
    note: "Declared in HTML with <template data-prize>. Weighted: the key is rare.",
    prizes: null, // null → use the element's <template> children
  },
  notes: {
    note: "Built in JS. Plain capsules, paper slips inside.",
    prizes: [
      { id: "slow", color: "#f1ece2", content: slip("Today is allowed to be slow.", "✶") },
      { id: "window", color: "#f2c14e", content: slip("Look out of a window for one whole minute.", "☼") },
      { id: "walk", color: "#62c0a0", content: slip("Take the long way home.", "↝") },
      { id: "call", color: "#4f86c6", content: slip("Call someone just to say hi.", "☏") },
      { id: "treat", color: "#f19bb2", content: slip("You've earned a small treat.", "♡") },
    ],
  },
  limited: {
    note: "Five capsules, one of each. Data-only prizes use the default card; turn until it sells out, then Refill.",
    prizes: [
      { id: "sun", color: "#f2c14e", thumb: "🌞", stock: 1, title: "Sunny sticker", description: "1 of 5" },
      { id: "moon", color: "#4f86c6", thumb: "🌙", stock: 1, title: "Moon sticker", description: "2 of 5" },
      { id: "star", color: "#9b7fd1", thumb: "⭐", stock: 1, title: "Star sticker", description: "3 of 5" },
      { id: "cloud", color: "#f1ece2", thumb: "☁️", stock: 1, title: "Cloud sticker", description: "4 of 5" },
      { id: "rainbow", color: "#e2574c", thumb: "🌈", stock: 1, title: "Rainbow sticker", description: "5 of 5" },
    ],
  },
};

function useSet(name) {
  gacha.reset();
  gacha.prizes = sets[name].prizes;
  setNote.textContent = sets[name].note;
  for (const button of document.querySelectorAll("[data-set]")) {
    button.classList.toggle("active", button.dataset.set === name);
  }
  updateStock();
}

for (const button of document.querySelectorAll("[data-set]")) {
  button.addEventListener("click", () => useSet(button.dataset.set));
}

for (const button of document.querySelectorAll("[data-theme]")) {
  button.addEventListener("click", () => {
    if (button.dataset.theme) gacha.setAttribute("theme", button.dataset.theme);
    else gacha.removeAttribute("theme");
    for (const other of document.querySelectorAll("[data-theme]")) other.classList.toggle("active", other === button);
  });
}

coinBox.addEventListener("change", () => {
  gacha.toggleAttribute("require-coin", coinBox.checked);
  coinButton.disabled = !coinBox.checked;
});
coinButton.addEventListener("click", () => gacha.insertCoin());
turnButton.addEventListener("click", () => gacha.turn());
document.getElementById("reset").addEventListener("click", () => gacha.reset());
document.getElementById("refill").addEventListener("click", () => { gacha.refill(); updateStock(); });
muteButton.addEventListener("click", () => {
  const muted = !gacha.hasAttribute("muted");
  gacha.toggleAttribute("muted", muted);
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.textContent = muted ? "Unmute" : "Mute";
});

function updateStock() {
  const remaining = gacha.remaining;
  stockEl.textContent = Number.isFinite(remaining) ? remaining + " left" : "";
}

gacha.addEventListener("statechange", (event) => {
  const { state } = event.detail;
  stateEl.textContent = state;
  document.body.dataset.state = state;
  turnButton.disabled = state !== "idle";
  updateStock();
});

gacha.addEventListener("reveal", (event) => {
  const { prize } = event.detail;
  const item = document.createElement("li");
  const title = prize.title || prize.template?.content.querySelector("h2")?.textContent || prize.id;
  item.innerHTML = '<span class="chip"></span>';
  item.querySelector(".chip").style.background = prize.color || "#ccc";
  item.append(document.createTextNode(title));
  historyEl.querySelector(".empty")?.remove();
  historyEl.prepend(item);
  while (historyEl.children.length > 5) historyEl.lastElementChild.remove();
});

gacha.whenReady().then(() => {
  stateEl.textContent = gacha.state;
  setNote.textContent = sets.objects.note;
  updateStock();
});
