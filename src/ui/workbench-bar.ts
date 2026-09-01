import { el, clear } from "../lib/dom.ts";
import { getState, subscribe, setSelection, setStatus } from "../store/store.ts";
import { bondVerdictGlyph } from "../chem/bonding.ts";
import { combineSelection, fetch3dConformer, assessHazard } from "../webmcp/ops.ts";
import { sfx } from "../lib/sound.ts";
import { toast } from "./toasts.ts";

// The human's control strip: what is selected, whether it bonds and why,
// and a Combine button. This is the beginner path — no agent required.

export function mountWorkbenchBar(root: HTMLElement) {
  const bar = el("div", { class: "wbench", hidden: true });
  root.append(bar);

  let busy = false;

  async function doCombine() {
    if (busy) return;
    busy = true;
    setStatus("Combining…");
    try {
      const r = await combineSelection(undefined, "person");
      if (r.ok) {
        if (getState().props) sfx.confirm(); else sfx.no();
        const cid = getState().props?.cid;
        if (cid) { await fetch3dConformer(cid, "person"); await assessHazard(cid, "person"); }
      } else {
        sfx.no();
        toast(r.text, 5000);
      }
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    const s = getState();
    if (!s.selection.length) { bar.hidden = true; return; }
    bar.hidden = false;
    clear(bar);

    const chips = el("div", { class: "wbench__sel" });
    for (const sym of s.selection) {
      chips.append(el("span", { class: "wbench__chip", text: sym }));
    }
    const clearBtn = el("button", { class: "wbench__x", "aria-label": "Clear selection", text: "clear" });
    clearBtn.addEventListener("click", () => setSelection([]));
    chips.append(clearBtn);

    const mid = el("div", { class: "wbench__bond" });
    const b = s.bond;
    if (b) {
      mid.dataset.verdict = b.verdict;
      mid.append(
        el("span", { class: "wbench__glyph", text: bondVerdictGlyph(b.verdict) }),
        el("span", { class: "wbench__type", text: b.bondType.replace("-", " ") }),
        b.formula ? el("span", { class: "wbench__f", text: b.formula }) : el("span", {}),
        el("span", { class: "wbench__why", text: b.why + (b.note ? `  (${b.note})` : "") }),
      );
    } else if (s.selection.length === 1) {
      mid.append(el("span", { class: "wbench__why", text: "Add one more element to see whether they bond." }));
    }

    const go = el("button", {
      class: "wbench__go",
      text: busy ? "…" : s.bond?.verdict === "no-bond" ? "Try anyway →" : "Combine →",
    });
    go.toggleAttribute("disabled", busy || s.selection.length < 1);
    go.addEventListener("click", () => void doCombine());

    bar.append(chips, mid, go);
  }

  subscribe(render);
  render();
}
