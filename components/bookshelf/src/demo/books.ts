import type { Book, Shelf } from "../core/Book";

export const shelves: Shelf[] = [
  { id: "fiction", title: "Fiction & Imagination", caption: "FICTION" },
  { id: "everyday", title: "Everyday Notes", caption: "EVERYDAY" },
  { id: "ideas", title: "Ideas & Essays", caption: "IDEAS" },
];

const entries: [string, string, string, number, number, number?][] = [
  ["Mountain Letters", "Rowan Vale", "#b4a9b4", 30, 214],
  ["A Room of Light", "Mira Cole", "#d2d0be", 22, 200],
  ["Night Crossing", "Elias North", "#684447", 44, 236],
  ["Hidden Streets", "Nora Finch", "#9fac8c", 28, 226],
  ["Slow Weather", "June Hart", "#b58e94", 34, 206],
  ["Small Sounds", "Theo Moss", "#969f70", 24, 218],
  ["Solar Tide", "Arden Ray", "#709a9b", 38, 240],
  ["Inner Country", "Ellis Stone", "#c8b676", 32, 228],
  ["Afternoon Light", "Rowan Vale", "#d5b287", 30, 210],
  ["Cabin Notes", "Mae Wilder", "#8e9d91", 40, 244],
  ["The Quiet Home", "Mara Field", "#cec8b5", 46, 232],
  ["Three Autumns", "Kira Snow", "#a77462", 26, 212],
  ["Green Things", "Owen Reed", "#a4ac82", 24, 204],
  ["Eight Square Metres", "Ana Park", "#8f9ca5", 28, 198],
  ["Field Notes", "Clara Moss", "#c3b49b", 36, 222],
  ["Roadside", "Jules Mercer", "#b5a189", 30, 216],
  ["Room for Air", "Rowan Vale", "#667476", 32, 226],
  ["Dawn Notes", "Elias North", "#b5a17b", 22, 200],
  ["Ways of Looking", "Mira Cole", "#d3cbbb", 26, 208],
  ["How to Read Slowly", "Owen Reed", "#8b655e", 42, 238],
  ["The Shape of Time", "Nora Finch", "#8c9ea8", 30, 220],
  ["Maintenance", "Theo Moss", "#b5b38f", 46, 246],
  ["Pale Hills", "Mae Wilder", "#a4b8b1", 24, 206],
  ["Silent Springtime", "Clara Moss", "#657a68", 34, 230],
];

const texts: Record<number, string[]> = {
  0: [
    `The letter arrived before the morning fog had lifted.

A bicycle stopped at the foot of the stone steps. The envelope was left in a wooden box beside the door, its corner darkened by rain.

I did not open it immediately. I boiled water, pushed the window open, and listened to a bird call once from somewhere beyond the bamboo.

Some messages can wait a little longer. They have already travelled far enough to reach you.`,
    `There was no important news inside.

A friend wrote about a bakery changing its sign, leaves collecting beside the river, and a coat that finally fit after a year in the closet. He asked whether nights in the mountains were cold and whether rain sounded different on a tiled roof.

I tried to describe the answer.

It was not silence. Wind moved beneath the eaves. Insects shifted through the grass. The floorboards answered the weather now and then. Every sound simply had enough room to stay.`,
    `I wrote back a few days later.

I mentioned a wildflower by the path, a cat asleep on the sill, and a book still waiting at page seventy-three. Its bookmark had been there for two seasons.

Nothing here had really slowed down, I told him. I had only stopped asking each day to become something else.

By the time I sealed the envelope, the fog had lifted. The ridge appeared line by line, like a sentence finally reaching its end.`,
  ],
  8: [
    `At four in the afternoon, sunlight crossed the opposite roof and landed on the white kitchen tiles.

For a few minutes the glass beside the sink held a small patch of gold. Water on the vegetables in the basket caught it too.

I used to think the parts of life worth remembering had to happen somewhere far away.

Most of the moments that stayed with me had no destination at all. I had simply been standing there when the light arrived.`,
    `We keep adding things to our days: a larger cabinet, a brighter lamp, another book about arranging a better life.

Sometimes a room improves when something is removed.

A little space between a cup and a stack of paper can change the whole table. Empty space is not an absence. It is an invitation to sit down, put both hands on the surface, and listen for a while.`,
    `That evening I left the lights off.

The room softened as it darkened. Tasks that had felt urgent at noon lost their sharp edges.

I washed the glass and returned it to the shelf. Tomorrow, at nearly the same hour, sunlight would pass through that spot again.

Perhaps ordinary life is mostly repetition. Attention is what makes each return feel new.`,
  ],
  16: [
    `In a drawing, the hardest part to place is sometimes the part that is not drawn.

A gap between two hills can hold distance, weather, and the path of the eye. Nothing is marked there, yet the composition depends on it.

Reading has spaces like that too: the pause after a sentence, the blank below the last line of a chapter, the moment before a page turns.`,
    `We are skilled at filling every pause.

We listen while walking, read while waiting, and reach for one more screen before sleep.

Thought needs an unfurnished room from time to time. Inside it, an idea can turn around, take a wrong path, or remain unfinished without having to justify itself.

Space is permission for something not to be resolved yet.`,
    `Today I left one page of my notebook empty.

It was not because I had nothing to write. I wanted to keep a place for a sentence that had not arrived.

A shadow from the window moved slowly across the paper, stayed for a moment, and passed on.

Sometimes making room is closer to saying what we mean than adding another line.`,
  ],
};

export const books: Book[] = entries.map(
  ([title, author, color, width, height, rotation], index) => ({
    id: `book-${index + 1}`,
    title,
    author,
    color,
    width,
    height,
    rotation,
    shelfId: shelves[Math.floor(index / 8)].id,
    order: index % 8,
    pages: texts[index] ?? [],
    progress: 0,
    subtitle: texts[index]
      ? "Original sample text for testing the reading flow."
      : "A neutral sample book used to demonstrate shelf layout and interaction.",
    year: texts[index] ? "Sample text · 2026" : "Demo book",
  }),
);
