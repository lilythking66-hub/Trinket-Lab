const tw = document.getElementById("tw");
const $ = (id) => document.getElementById(id);

const SAMPLES = {
  en: "Dear friend,\nThe quick brown fox jumps over the lazy dog. Good things take time.\n",
  zh: "见字如面。\n今天的风很温柔，想把它装进信封寄给你。\n",
  ja: "拝啓\n雨の音を聞きながら、この手紙を書いています。\n",
  mix: "Hello, 你好, こんにちは, 안녕하세요, ¡Hola! Ça va? ✉️\n",
};

let typing = null;
async function sample(key) {
  typing?.abort();
  const ctrl = new AbortController();
  typing = ctrl;
  tw.focus();
  await tw.type(SAMPLES[key], { cps: 13, signal: ctrl.signal });
  if (typing === ctrl) typing = null;
}
for (const b of document.querySelectorAll("[data-sample]")) b.addEventListener("click", () => sample(b.dataset.sample));

function pos() {
  $("pos").textContent = tw.hasPaper ? `line ${tw.line + 1} / ${tw.rows} · col ${tw.column + 1} / ${tw.columns}` : "no paper";
}
for (const ev of ["change", "type", "space", "return", "backspace", "sheet", "eject", "linefeed"]) tw.addEventListener(ev, pos);
tw.addEventListener("focus", () => document.body.toggleAttribute("data-focused", true));
tw.addEventListener("blur", () => document.body.toggleAttribute("data-focused", false));
tw.addEventListener("pagefull", () => { $("hint").textContent = "The page is full. Take it out and feed a new sheet."; });
tw.addEventListener("bell", () => { $("hint").textContent = "Ding! A few characters left on this line."; });
tw.addEventListener("return", () => { $("hint").textContent = "Click the paper to start typing · Enter or the lever returns the carriage"; });

/* taken pages are host content: the component only hands the text back */
function addPage(page) {
  if (!page || !page.text.trim()) return;
  $("pages-label").hidden = false;
  const li = document.createElement("li");
  const pre = document.createElement("pre");
  pre.className = "page";
  pre.style.setProperty("--tilt", `${(Math.random() - 0.5) * 2.4}deg`);
  pre.textContent = page.text;
  const copy = document.createElement("button");
  copy.textContent = "copy";
  copy.addEventListener("click", () => navigator.clipboard?.writeText(page.text).then(() => { copy.textContent = "copied"; }));
  pre.append(copy);
  li.append(pre);
  $("pages").prepend(li);
}
$("take").addEventListener("click", async () => {
  typing?.abort();
  addPage(await tw.eject());
  pos();
  await tw.newSheet();
});
$("new").addEventListener("click", async () => { typing?.abort(); await tw.newSheet(); });

/* finishes and options */
function group(id, attr, apply) {
  const root = $(id);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const x of root.querySelectorAll("button")) x.classList.toggle("active", x === b);
    apply(b.dataset[attr]);
  });
}
const setAttr = (name) => (v) => (v ? tw.setAttribute(name, v) : tw.removeAttribute(name));
group("themes", "theme", setAttr("theme"));
group("paper", "paper", setAttr("paper"));
group("ink", "ink", setAttr("ink"));
group("lineend", "v", (v) => tw.setAttribute("line-end", v));
group("backspace", "v", (v) => tw.setAttribute("backspace", v));
$("sound").addEventListener("change", (e) => (e.target.checked ? tw.removeAttribute("muted") : tw.setAttribute("muted", "")));

await tw.whenReady();
pos();
tw.print("Good things take time.\n");
pos();
