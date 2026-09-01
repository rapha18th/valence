import { el } from "../lib/dom.ts";
import { onActivity, setStatus } from "../store/store.ts";
import { sfx } from "../lib/sound.ts";

// The agent's presence on the bench. When a tool runs from the agent path,
// the ghost cursor glides to each target and traces it.

export function mountGhostCursor() {
  const ghost = el("div", { class: "ghost", "aria-hidden": "true" }, [
    el("div", {
      class: "ghost__pointer",
      html: `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 2l6 16 2.5-6.5L19 9z" fill="var(--signal)" stroke="#06181d" stroke-width="1"/></svg>`,
    }),
    el("div", { class: "ghost__tag", text: "agent" }),
  ]);
  document.body.append(ghost);

  let hideTimer = 0;
  let idleTimer = 0;
  let queue: Promise<void> = Promise.resolve();

  function armIdleHide() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => { ghost.dataset.on = "false"; }, 2400);
  }

  function moveTo(x: number, y: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      ghost.animate(
        [{ transform: ghost.style.transform || "translate(0,0)" }, { transform: `translate(${x}px, ${y}px)` }],
        { duration: ms, easing: "cubic-bezier(0.22, 1.2, 0.36, 1)", fill: "forwards" },
      );
      ghost.style.transform = `translate(${x}px, ${y}px)`;
      setTimeout(resolve, ms);
    });
  }

  onActivity((a) => {
    queue = queue.then(async () => {
      window.clearTimeout(hideTimer);
      ghost.dataset.on = "true";

      if (a.kind === "target" && a.selector) {
        const target = document.querySelector(a.selector);
        if (target) {
          const r = target.getBoundingClientRect();
          await moveTo(r.left + r.width / 2 - 4, r.top + r.height / 2 - 2, 260);
          sfx.agent();
          target.classList.add("traced");
          setTimeout(() => target.classList.remove("traced"), 640);
        }
        if (a.label) setStatus(`Agent: ${a.label}`);
      } else if (a.kind === "note") {
        setStatus(`Agent: ${a.label}`);
        await new Promise((r) => setTimeout(r, 220));
      } else if (a.kind === "done") {
        setStatus(a.label || "Agent: done.");
        hideTimer = window.setTimeout(() => { ghost.dataset.on = "false"; }, 1400);
      }
      armIdleHide();
    });
  });
}
