import { PATTERNS, patternPreview } from "../../components/crank-press/press-element.js";

const press = document.getElementById("press");
const $ = (id) => document.getElementById(id);

const FORTUNES = [
  "Something you lost\nis on its way back.",
  "今天适合\n慢一点，再慢一点。",
  "Say yes to the\nsmall adventure.",
  "你等的那封信，\n已经在路上了。",
  "The kettle knows.\nMake two cups.",
];
let ticketNo = 417;
let fortune = 0;

/* Sheets are host content: the press only carries them through. */
const SCENES = {
  slip: { roller: null, impression: "emboss", sheet: () => ({ length: 440 }) },
  ticket: {
    roller: "frame", impression: "ink", ink: "brown",
    sheet: () => ({
      length: Math.round(press.turnLength), // one crank turn = one ticket
      content: () => {
        const node = press.querySelector('template[data-sheet="ticket"]').content.cloneNode(true);
        node.querySelector("[data-no]").textContent = String(++ticketNo).padStart(6, "0");
        node.querySelector("[data-seat]").textContent = String(1 + (ticketNo % 18));
        return node;
      },
    }),
  },
  note: {
    roller: "plain", impression: "none",
    sheet: () => ({
      width: 150, length: 260, paper: "white",
      content: `<div class="note">${FORTUNES[fortune++ % FORTUNES.length].replace(/\n/g, "<br>")}<small>— TODAY'S NOTE —</small></div>`,
    }),
  },
  monogram: { roller: "monogram", impression: "emboss", sheet: () => ({ length: Math.round(press.turnLength), width: 220 }) },
};
let scene = "slip";
let paper = "cream";
let chosenRoller = "vine";

function applyScene() {
  const sc = SCENES[scene];
  press.setAttribute("roller", sc.roller ?? chosenRoller);
  press.setAttribute("impression", sc.impression);
  sc.ink ? press.setAttribute("ink", sc.ink) : press.removeAttribute("ink");
  markRoller(press.getAttribute("roller"));
}
function sheetSpec() {
  const s = SCENES[scene].sheet();
  return { paper, ...s, paper: s.paper ?? paper };
}
async function newSheet() {
  await press.load(sheetSpec());
}

/* ---- status ---- */
const STATES = { empty: "no paper", loading: "feeding in…", gripped: "in the rollers", released: "coming out", out: "on the table" };
function status() {
  $("state").textContent = `${STATES[press.state]}${press.state === "gripped" ? ` · ${Math.round(press.progress * 100)}%` : ""}`;
  $("meter").style.width = `${press.progress * 100}%`;
}
let still = 0;
press.addEventListener("feed", () => { document.body.toggleAttribute("data-moving", true); clearTimeout(still); still = setTimeout(() => document.body.toggleAttribute("data-moving", false), 160); status(); });
for (const ev of ["load", "grip", "complete", "out", "take"]) press.addEventListener(ev, status);
press.addEventListener("grip", () => { $("hint").textContent = "Drag the wheel round · or focus it and hold →"; });
press.addEventListener("complete", () => { $("hint").textContent = "Tap the sheet to take it"; });
press.addEventListener("pawl", () => { $("hint").textContent = "The ratchet only turns one way"; });

/* taken sheets come back as a standalone node */
press.addEventListener("take", (e) => {
  const { node, sheet } = e.detail;
  $("tray-label").hidden = false;
  const li = document.createElement("li");
  li.style.setProperty("--tilt", `${(Math.random() - 0.5) * 5}deg`);
  const k = 92 / sheet.width;
  const holder = document.createElement("div");
  holder.className = "holder";
  holder.style.height = `${sheet.length * k}px`;
  node.style.transform = `scale(${k})`;
  holder.append(node);
  li.append(holder);
  $("tray").prepend(li);
  while ($("tray").children.length > 8) $("tray").lastChild.remove();
  setTimeout(newSheet, 250);
});

/* ---- controls ---- */
$("auto").addEventListener("click", async () => {
  if (press.state === "out" || press.state === "released") { await press.take(); return; }
  if (press.state === "empty") await newSheet();
  press.feedAll();
});
$("new").addEventListener("click", newSheet);

$("scenes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  for (const x of $("scenes").children) x.classList.toggle("active", x === b);
  scene = b.dataset.scene;
  applyScene();
  $("letter-row").hidden = press.getAttribute("roller") !== "monogram";
  newSheet();
});

function markRoller(name) {
  for (const x of $("rollers").children) x.classList.toggle("active", x.dataset.roller === name);
  $("letter-row").hidden = name !== "monogram";
}
async function buildRollers() {
  const names = ["vine", "paws", "stars", "bows", "frame", "leaves", "monogram", "plain"];
  for (const name of names) {
    const b = document.createElement("button");
    b.className = "roller";
    b.dataset.roller = name;
    b.innerHTML = `<img alt=""><span>${PATTERNS[name].label}</span>`;
    $("rollers").append(b);
    patternPreview(name, { width: name === "frame" ? 60 : 56, height: 60, letter: $("letter").value || "A", offsetY: name === "frame" ? 0 : null })
      .then((url) => { b.querySelector("img").src = url; });
  }
  markRoller(press.getAttribute("roller"));
}
$("rollers").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  chosenRoller = b.dataset.roller;
  press.setAttribute("roller", chosenRoller);
  markRoller(chosenRoller);
  // a fresh sheet if the current one hasn't been pressed yet
  if (press.progress === 0) newSheet();
});
$("letter").addEventListener("input", () => {
  press.setAttribute("letter", $("letter").value.trim() || "A");
  if (press.progress === 0) newSheet();
});

$("papers").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  for (const x of $("papers").children) x.classList.toggle("active", x === b);
  paper = b.dataset.paper;
  if (press.progress === 0 || press.state === "out") newSheet();
});
$("themes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  for (const x of $("themes").children) x.classList.toggle("active", x === b);
  b.dataset.theme ? press.setAttribute("theme", b.dataset.theme) : press.removeAttribute("theme");
});
$("sound").addEventListener("change", (e) => (e.target.checked ? press.removeAttribute("muted") : press.setAttribute("muted", "")));

await press.whenReady();
buildRollers();
applyScene();
await newSheet();
status();
