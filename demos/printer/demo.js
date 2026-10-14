const printer = document.getElementById("printer");
const paper = document.getElementById("paper");
const state = document.getElementById("state");
const seek = document.getElementById("seek");
const seekOut = document.getElementById("seek-out");
const printButton = document.getElementById("print");
const cancelButton = document.getElementById("cancel");
const choices = [...document.querySelectorAll("[data-paper]")];

const papers = {
  postcard: {
    width: 586,
    height: 733,
    className: "paper postcard",
    html: [
      '<div class="postcard-art">',
      '<span class="sun"></span>',
      '<span class="mountain one"></span>',
      '<span class="mountain two"></span>',
      '<span class="lake"></span>',
      '</div>',
      '<p class="paper-kicker">A SMALL PLACE TO KEEP</p>',
      '<h2>Lakeside afternoon</h2>',
      '<p>Wind, water, and nowhere else to be.</p>',
      '<span class="paper-no">NO. 001</span>'
    ].join("")
  },
  note: {
    width: 586,
    height: 820,
    className: "paper note",
    html: [
      '<p class="paper-kicker">A NOTE FOR LATER</p>',
      '<h2>Remember this bit.</h2>',
      '<p class="handwriting">The light landed on the table at 4:17, and for a minute the whole room looked softer.</p>',
      '<div class="note-lines"></div>',
      '<span class="paper-no">14 OCT</span>'
    ].join("")
  },
  receipt: {
    width: 470,
    height: 1180,
    className: "paper receipt",
    html: [
      '<p class="receipt-head">TRINKET GENERAL STORE</p>',
      '<p class="receipt-sub">PAPER MEMORY DEPARTMENT</p>',
      '<hr>',
      '<div class="row"><span>ONE SLOW MORNING</span><span>1</span></div>',
      '<div class="row"><span>WINDOW LIGHT</span><span>2</span></div>',
      '<div class="row"><span>COFFEE STILL WARM</span><span>1</span></div>',
      '<div class="row"><span>UNPLANNED TIME</span><span>∞</span></div>',
      '<div class="row"><span>SMALL GOOD THING</span><span>3</span></div>',
      '<hr>',
      '<div class="row total"><span>TOTAL</span><span>A NICE DAY</span></div>',
      '<p class="thanks">THANK YOU FOR NOT RUSHING</p>',
      '<div class="barcode"></div>'
    ].join("")
  }
};

function setPaper(kind) {
  const next = papers[kind];
  printer.reset();
  paper.className = next.className;
  paper.innerHTML = next.html;
  printer.setPaperSize(next.width, next.height);
  seek.value = 0;
  seekOut.value = "0%";
  for (const button of choices) {
    button.classList.toggle("active", button.dataset.paper === kind);
  }
}

for (const button of choices) {
  button.addEventListener("click", () => setPaper(button.dataset.paper));
}

printButton.addEventListener("click", () => printer.print());
document.getElementById("reset").addEventListener("click", () => {
  printer.reset();
  seek.value = 0;
  seekOut.value = "0%";
});
cancelButton.addEventListener("click", () => printer.cancel());

seek.addEventListener("input", () => {
  const value = Number(seek.value);
  printer.seek(value / 100);
  seekOut.value = value + "%";
});

printer.addEventListener("statechange", (event) => {
  const next = event.detail.state;
  state.textContent = next;
  document.body.dataset.state = next;
  const busy = next === "feeding" || next === "settling";
  printButton.disabled = busy;
  cancelButton.disabled = !busy;
  for (const button of choices) button.disabled = busy;
});

printer.addEventListener("frame", (event) => {
  const value = Math.round(event.detail.frame.progress * 100);
  seek.value = value;
  seekOut.value = value + "%";
});

printer.addEventListener("printcomplete", () => {
  seek.value = 100;
  seekOut.value = "100%";
});
