(() => {
  "use strict";

  const styles = `
    :host {
      all: initial;
      box-sizing: border-box;
      color-scheme: light;
      --surface: #f5f5f5;
      --ink: #303030;
      --muted: #5f5f5f;
      --line: #d5d5d5;
      --focus: #737373;
      --hover: #eaeaea;
      --selected: #dfdfdf;
      --selected-hover: #d8d8d8;
      --down: #d0d0d0;
      --field: #fafafa;
      --tip: #393939;
      --tip-ink: #f2f2f2;
      --shadow: #0000001c;
      position: fixed;
      inset: 9px 16px auto auto;
      margin: 0;
      padding: 0;
      border: 0;
      width: 438px;
      max-width: calc(100% - 32px);
      overflow: visible;
      background: transparent;
      color: var(--ink);
      font: 13px/1.4 system-ui, sans-serif;
      direction: ltr;
    }
    :host(:not(:popover-open)) { display: none; }
    *, *::before, *::after { box-sizing: border-box; }
    .bar {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 5px;
      border: 1px solid var(--line);
      border-top: 0;
      border-radius: 11px;
      background: var(--surface);
      box-shadow: 0 3px 12px var(--shadow);
    }
    .field {
      display: flex;
      flex: 1;
      align-items: center;
      min-width: 0;
      height: 31px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding-inline: 7px;
      background: var(--field);
    }
    .field:focus-within { border-color: var(--focus); }
    input {
      display: block;
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--ink);
      font: inherit;
    }
    input::placeholder { color: var(--muted); opacity: 1; }
    .count {
      white-space: nowrap;
      padding-inline-start: 4px;
      color: var(--muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .group { display: flex; align-items: center; gap: 2px; }
    .control { position: relative; display: flex; }
    button {
      display: grid;
      place-items: center;
      width: 29px;
      height: 29px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    button:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
    button[aria-pressed="true"] { background: var(--selected); color: var(--ink); }
    button[aria-pressed="true"]:hover { background: var(--selected-hover); }
    button:active:not(:disabled) { background: var(--down); color: var(--ink); }
    button:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; }
    button:disabled { opacity: .38; cursor: default; }
    svg { display: block; width: 16px; height: 16px; pointer-events: none; }
    .tooltip {
      position: absolute;
      visibility: hidden;
      opacity: 0;
      z-index: 1;
      inset: calc(100% + 7px) 0 auto auto;
      padding: 4px 7px;
      border-radius: 5px;
      background: var(--tip);
      color: var(--tip-ink);
      white-space: nowrap;
      font-size: 11px;
      pointer-events: none;
    }
    .control:hover > button:not(:disabled) + .tooltip,
    .control > button:focus-visible + .tooltip {
      visibility: visible;
      opacity: 1;
      transition: opacity .1s .25s, visibility 0s .25s;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        color-scheme: dark;
        --surface: #292929;
        --ink: #e7e7e7;
        --muted: #bcbcbc;
        --line: #4c4c4c;
        --focus: #929292;
        --hover: #343434;
        --selected: #404040;
        --selected-hover: #484848;
        --down: #515151;
        --field: #252525;
        --tip: #dedede;
        --tip-ink: #292929;
        --shadow: #00000055;
      }
    }
    @media (forced-colors: active) {
      button[aria-pressed="true"] { border-color: Highlight; }
      input:focus-visible { outline: 1px solid Highlight; }
    }
    @media (max-width: 380px) {
      :host { inset: 6px 5px auto 5px; width: auto; max-width: none; }
      .bar { gap: 2px; padding: 3px; }
      .group { gap: 0; }
      button { width: 24px; }
      .field { padding-inline: 4px; }
    }
  `;

  function createBar({ onNavigate, onOption, onClose }) {
    const host = document.createElement("find-options-panel");
    host.setAttribute("popover", "manual");
    const root = host.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    root.adoptedStyleSheets = [sheet];

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "search");
    bar.setAttribute("aria-label", "Slightly Better Find");
    const field = document.createElement("div");
    field.className = "field";
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Find in page");
    input.placeholder = "Find in page";
    input.autocomplete = "off";
    input.spellcheck = false;
    const count = document.createElement("span");
    count.className = "count";
    count.setAttribute("role", "status");
    field.append(input, count);
    bar.append(field);

    function symbol(name) {
      const namespace = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(namespace, "svg");
      const attributes = {
        viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8",
        "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"
      };
      for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
      for (const [tag, values] of globalThis.findOptionsIcons[name]) {
        const shape = document.createElementNS(namespace, tag);
        for (const [key, value] of Object.entries(values)) shape.setAttribute(key, value);
        svg.append(shape);
      }
      return svg;
    }

    function control(parent, label, icon, action) {
      const wrapper = document.createElement("span");
      wrapper.className = "control";
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.append(symbol(icon));
      button.addEventListener("click", action);
      const tooltip = document.createElement("span");
      tooltip.className = "tooltip";
      tooltip.setAttribute("aria-hidden", "true");
      tooltip.textContent = label;
      wrapper.append(button, tooltip);
      parent.append(wrapper);
      return button;
    }

    const navigation = document.createElement("div");
    navigation.className = "group";
    const back = control(navigation, "Previous match", "chevron-left", () => onNavigate(-1));
    const forward = control(navigation, "Next match", "chevron-right", () => onNavigate(1));
    bar.append(navigation);

    const options = document.createElement("div");
    options.className = "group";
    const toggles = {
      highlightAll: control(options, "Highlight all matches", "highlighter", () => onOption("highlightAll")),
      matchCase: control(options, "Match case", "case-sensitive", () => onOption("matchCase")),
      wholeWord: control(options, "Match whole word", "whole-word", () => onOption("wholeWord"))
    };
    bar.append(options);
    control(bar, "Close Find", "x", onClose);
    root.append(bar);

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    });

    function update(active, total, settings, hasQuery) {
      const caption = hasQuery ? `${active + 1}/${total}` : "";
      if (count.textContent !== caption) count.textContent = caption;
      back.disabled = !total;
      forward.disabled = !total;
      for (const [key, button] of Object.entries(toggles)) {
        button.setAttribute("aria-pressed", String(settings[key]));
      }
    }

    document.documentElement.append(host);
    return { host, input, update };
  }

  globalThis.createFindOptionsBar = createBar;
})();
