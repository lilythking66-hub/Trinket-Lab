import { defineTheme } from "./Theme";
export { neutralTheme } from "./Theme";

/** Warm oak study: the original Bookshelf Lab look, kept as an example product skin. */
export const oakTheme = defineTheme({
  shelf: {
    top: 0xd8c8a9,
    front: 0xbba480,
    highlight: 0xe3d4b7,
    edge: 0x938065,
    grain: 0x6f593a,
    grainAlpha: 0.17,
    shadow: 0x4c4431,
    shadowAlpha: 1,
    wall: 0xe4dac7,
  },
  spine: {
    inkOnLight: "#333b34",
    inkOnDark: "#f3edda",
    bandColor: "#f9efd15c",
    mark: "B · L",
  },
  surface: {
    veil: "rgba(245, 243, 237, 0.84)",
    paper: "#fbf8ef",
    paperEdge: "#d3cbb8",
    ink: "#383c35",
    muted: "#747762",
    accent: "#7d886d",
    sans: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  dropTarget: 0x79846a,
});
