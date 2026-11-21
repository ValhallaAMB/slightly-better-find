(() => {
  "use strict";

  const colors = globalThis.findOptionsColors;
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
      flex-direction: column;
      gap: 5px;
      padding: 5px;
      border: 1px solid var(--line);
      border-top: 0;
      border-radius: 11px;
      background: var(--surface);
      box-shadow: 0 3px 12px var(--shadow);
    }
    .toolbar, .term-row { display: flex; align-items: center; gap: 3px; }
    .toolbar { justify-content: flex-end; }
    .toolbar > .count { margin-inline-end: auto; }
    .term-row.is-current .count { color: var(--ink); font-weight: 600; }
    .extra-terms { display: flex; flex-direction: column; gap: 4px; }
    .extra-terms[hidden] { display: none; }
    .term-rows { display: grid; gap: 3px; max-height: min(55vh, 204px); overflow: auto; }
    .add-term { align-self: flex-start; }
    .swatch {
      flex: none;
      width: 10px;
      height: 10px;
      margin-inline-end: 6px;
      border-radius: 50%;
      border: 1px solid #0004;
      background: var(--term-light);
    }
    button[aria-expanded="true"] { background: var(--selected); }
    button[aria-expanded="true"] svg { transform: rotate(180deg); }
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
    button[aria-pressed="mixed"] { border-color: var(--focus); border-style: dashed; color: var(--ink); }
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
      .swatch { background: var(--term-dark); }
    }
    @media (forced-colors: active) {
      button[aria-pressed="true"] { border-color: Highlight; }
      input:focus-visible { outline: 1px solid Highlight; }
    }
    @media (max-width: 380px) {
      :host { inset: 6px 5px auto 5px; width: auto; max-width: none; }
      .bar { gap: 3px; padding: 3px; }
      .toolbar, .term-row { gap: 2px; }
      .swatch { width: 8px; height: 8px; margin-inline-end: 3px; }
      .group { gap: 0; }
      button { width: 24px; }
      .field { padding-inline: 4px; }
    }
  `;

  function createBar({ onNavigate, onOption, onClose, onTermsChanged, onFieldChange }) {
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
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    const extra = document.createElement("div");
    extra.id = "extra-search-terms";
    extra.className = "extra-terms";
    extra.setAttribute("role", "group");
    extra.setAttribute("aria-label", "Search terms");
    const rows = document.createElement("div");
    rows.className = "term-rows";
    extra.append(rows);
    bar.append(toolbar, extra);

    const fields = new Map();
    const options = [
      ["highlightAll", "Highlight all matches", "highlighter"],
      ["matchCase", "Match case", "case-sensitive"],
      ["wholeWord", "Match whole word", "whole-word"]
    ];

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

    function control(parent, label, icon, action, nativeTooltip = false) {
      const wrapper = document.createElement("span");
      wrapper.className = "control";
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.append(symbol(icon));
      button.addEventListener("click", action);
      wrapper.append(button);
      if (nativeTooltip) {
        button.title = label;
      } else {
        const tooltip = document.createElement("span");
        tooltip.className = "tooltip";
        tooltip.setAttribute("aria-hidden", "true");
        tooltip.textContent = label;
        wrapper.append(tooltip);
      }
      parent.append(wrapper);
      return button;
    }

    function makeCount(label) {
      const count = document.createElement("span");
      count.className = "count";
      count.setAttribute("role", "status");
      count.setAttribute("aria-label", label);
      return count;
    }

    function makeControls(parent, term) {
      const isLocal = term !== undefined;
      const suffix = isLocal ? ` for search term ${term + 1}` : "";
      const navigation = document.createElement("div");
      navigation.className = "group";
      const previous = control(navigation, "Previous match" + suffix, "chevron-left", () => onNavigate(-1, term), isLocal);
      const next = control(navigation, "Next match" + suffix, "chevron-right", () => onNavigate(1, term), isLocal);
      const tools = document.createElement("div");
      tools.className = "group";
      const toggles = Object.fromEntries(options.map(([key, label, icon]) =>
        [key, control(tools, label + suffix, icon, () => onOption(key, term), isLocal)]));
      parent.append(navigation, tools);
      return { previous, next, toggles };
    }

    function makeTerm(term) {
      const row = document.createElement("div");
      row.className = "term-row";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `Search term ${term + 1} controls`);
      const field = document.createElement("div");
      field.className = "field";
      const input = document.createElement("input");
      input.setAttribute("aria-label", term ? `Search term ${term + 1}` : "Find in page");
      input.placeholder = term ? "Enter a word or phrase" : "Find in page";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.term = String(term);
      const count = makeCount(`Search term ${term + 1} matches`);
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.setAttribute("aria-hidden", "true");
      swatch.style.setProperty("--term-light", colors[term][0]);
      swatch.style.setProperty("--term-dark", colors[term][2]);
      field.append(swatch, input, count);
      row.append(field);
      const controls = makeControls(row, term);
      const clear = term ? `Remove search term ${term + 1}` : "Clear search term 1";
      control(row, clear, "x", () => {
        const hadQuery = Boolean(input.value.trim());
        if (term) {
          fields.delete(term);
          row.remove();
          add.disabled = false;
          onFieldChange(term, hadQuery);
          add.focus();
        } else {
          input.value = "";
          if (hadQuery) onTermsChanged(0);
          input.focus();
        }
      }, true);
      const entry = { row, field, input, count, controls };
      fields.set(term, entry);
      rows.append(row);
      return entry;
    }

    const primary = makeTerm(0);
    const globalCount = makeCount("All matches");
    const globalControls = makeControls(toolbar);
    const dropdown = control(toolbar, "Multiple search terms", "chevron-down", () => {
      const expand = extra.hidden;
      setExpanded(expand);
      if (expand && fields.size === 1) addTerm();
      else primary.input.focus();
    });
    dropdown.setAttribute("aria-controls", extra.id);
    control(toolbar, "Close Find", "x", onClose);
    const add = control(extra, "Add search term", "plus", addTerm);
    add.parentElement.classList.add("add-term");
    root.append(bar);
    setExpanded(false);

    function setExpanded(expand) {
      extra.hidden = !expand;
      dropdown.setAttribute("aria-expanded", String(expand));
      primary.count.hidden = !expand;
      if (expand) {
        primary.row.prepend(primary.field);
        toolbar.prepend(globalCount);
      } else {
        toolbar.prepend(primary.field);
        primary.field.append(globalCount);
      }
    }

    function addTerm() {
      const term = colors.findIndex((_, index) => !fields.has(index));
      if (term < 0) return;
      const entry = makeTerm(term);
      add.disabled = fields.size >= colors.length;
      onFieldChange();
      entry.input.focus();
    }

    function resetQueries() {
      primary.input.value = "";
      for (const [term, entry] of fields) {
        if (!term) continue;
        fields.delete(term);
        entry.row.remove();
      }
      add.disabled = false;
      setExpanded(false);
    }

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    });

    function updateControls(controls, total, settings) {
      controls.previous.disabled = !total;
      controls.next.disabled = !total;
      for (const [key, button] of Object.entries(controls.toggles)) {
        button.setAttribute("aria-pressed", String(settings[key]));
      }
    }

    function updateCount(count, active, total, hasQuery) {
      const value = hasQuery ? `${active}/${total}` : "";
      if (count.textContent !== value) count.textContent = value;
    }

    function update(global, locals) {
      updateCount(globalCount, global.position, global.total, global.hasQuery);
      updateControls(globalControls, global.total, global.settings);
      for (const [term, entry] of fields) {
        const { position, total, current, settings } = locals.get(term);
        updateCount(entry.count, position, total, Boolean(entry.input.value.trim()));
        updateControls(entry.controls, total, settings);
        entry.row.classList.toggle("is-current", current);
      }
    }

    document.documentElement.append(host);
    return {
      host, input: primary.input, update, resetQueries,
      isExpanded: () => !extra.hidden,
      terms: () => fields.keys(),
      termOf: (element) => {
        const term = Number(element?.dataset?.term);
        return fields.get(term)?.input === element ? term : undefined;
      },
      queries: () => Array.from(fields, ([term, { input }]) => ({ term, text: input.value.trim() })).filter(({ text }) => text)
    };
  }

  globalThis.createFindOptionsBar = createBar;
})();
