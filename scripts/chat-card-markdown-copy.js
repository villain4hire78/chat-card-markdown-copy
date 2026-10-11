const MODULE_ID = "chat-card-markdown-copy";

Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!(html instanceof HTMLElement)) return;
  if (!message.isContentVisible) return;

  const actions = html.querySelector(".message-buttons, .message-header");
  if (!actions || actions.querySelector(`[data-${MODULE_ID}-button]`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-card-markdown-copy-button";
  button.dataset.chatCardMarkdownCopyButton = "true";
  button.title = "Copy message as Markdown";
  button.setAttribute("aria-label", "Copy message as Markdown");
  button.innerHTML = '<i class="fa-solid fa-copy" aria-hidden="true"></i>';
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const markdown = messageToMarkdown(message, html);
      console.debug(`${MODULE_ID} | Copy source`, {
        messageId: message.id,
        messageContent: message.content,
        html: html.outerHTML,
        markdown,
      });
      await navigator.clipboard.writeText(markdown);
      ui.notifications.info("Chat message copied as Markdown.");
    } catch (error) {
      console.error(`${MODULE_ID} | Could not write to clipboard`, error);
      ui.notifications.error("Could not copy chat message. Check browser clipboard permissions.");
    }
  });

  actions.append(button);
});

function messageToMarkdown(message, html) {
  const speaker = cleanInline(message.speaker?.alias || message.alias || "Unknown speaker");
  const stamp = message.timestamp ? new Date(message.timestamp).toLocaleString() : "";
  const header = stamp ? `**${speaker}** · ${stamp}` : `**${speaker}**`;
  const body = htmlToMarkdown(message, html);
  return body ? `${header}\n\n${body}` : header;
}

function htmlToMarkdown(message, html) {
  const brData = message.getFlag?.("betterrolls-swade2", "br_data");
  if (brData) return betterRollsToMarkdown(message, brData, html);

  const content = html.querySelector(".message-content") || html;
  const clone = content.cloneNode(true);
  const systemCard = clone.matches?.(".dnd5e2.chat-card, .dnd5e.chat-card, .chat-card")
    ? clone
    : clone.querySelector(".dnd5e2.chat-card, .dnd5e.chat-card, .chat-card");
  if (systemCard) return systemCardToMarkdown(systemCard, message);

  clone.querySelectorAll(`.${MODULE_ID}-button, button, input, select, textarea, form,
    .dice-tooltip, .tooltip, .message-control, .visibility, .targets, .target-list,
    .apply-damage, .damage-application, script, style`).forEach((element) => element.remove());

  const roll = message.isRoll ? formatRolls(message.rolls) : "";
  if (roll) {
    const rollElements = clone.querySelectorAll(
      ".dice-total, .roll-total, .total, .dice-result .total, [data-roll-total]",
    );
    rollElements.forEach((element) => element.remove());
  }

  let markdown = normalizeMarkdown(convertNode(clone));
  if (roll) {
    // Keep system card text intact, but place the mechanical outcome first for quick reading.
    const existingRoll = markdown.match(/(?:^|\n)(?:TN\s*\d+\s*)?Result\s+[^\n]+/i)?.[0]?.trim();
    const rollSummary = existingRoll ? `${roll}\n${existingRoll}` : roll;
    if (existingRoll) markdown = markdown.replace(existingRoll, "").trim();
    markdown = [rollSummary, markdown].filter(Boolean).join("\n\n");
  }

  return normalizeMarkdown(markdown) || normalizeMarkdown(convertNodeFromHtml(message.content || ""));
}

function systemCardToMarkdown(card, message) {
  const lines = [];
  const title = card.querySelector(".card-header h3, .card-header h2, .item-name, .title")?.textContent?.trim();
  const subtitle = card.querySelector(".card-header .subtitle, .card-header .item-type")?.textContent?.trim();
  const roll = message.isRoll ? formatRolls(message.rolls) : "";
  if (roll) lines.push(roll);
  if (title) lines.push(subtitle ? `**${title}** · ${subtitle}` : `**${title}**`);

  const tags = Array.from(card.querySelectorAll(".tag, .tags > *, .card-header .tag"))
    .map((element) => element.textContent.trim())
    .filter(Boolean);
  if (tags.length) lines.push(tags.map((tag) => `- ${tag}`).join("\n"));

  return normalizeMarkdown(lines.join("\n\n"))
    || normalizeMarkdown(convertNode(card.cloneNode(true)));
}

function betterRollsToMarkdown(message, brData, html) {
  const content = html.querySelector(".message-content") || html;
  const cardRoot = content.matches?.(".brsw-card") ? content : content.querySelector(".brsw-card") || content;
  const title = cardRoot.querySelector(".brsw-header-title")?.textContent?.trim();
  const lines = [];
  const actor = game.actors.get(brData.actor_id) || game.actors.get(brData.token_id)?.actor;
  const trait = brData.trait?.id ? actor?.items?.get(brData.trait.id) : null;
  const traitTitle = trait?.name || cardRoot.querySelector(".brsw-trait-title")?.textContent?.trim();
  const isSkillCard = Number(brData.type) === 2;

  const context = cardRoot.querySelector(".brsw-card-note-extra")?.textContent?.trim();
  const isPowerCard = Boolean(cardRoot.querySelector(".brsw-pp-cost, .brsw-pp-toggle"));
  if (context && isPowerCard) lines.push(context);

  const storedDice = brData.traitRoll?.currentRoll?.dice || [];
  const rollValues = storedDice.map((die) => die.finalTotal ?? die.total ?? die.result)
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String);
  if (!rollValues.length) rollValues.push(...Array.from(cardRoot.querySelectorAll(".brsw-roll-value-total"))
    .map((row) => row.textContent.trim())
    .filter(Boolean));
  const traitRollDetail = cardRoot.querySelector(".brsw-roll-detail:not(.brsw-collapsed)");
  const traitNames = Array.from(cardRoot.querySelectorAll(".brsw-roll-detail-row"))
    .filter((row) => row.closest(".brsw-roll-detail") === traitRollDetail)
    .map((row) => row.textContent.trim())
    .filter((text) => /\bTN\s*\d+\s*Result\s*\d+\b/i.test(text));
  const damageRows = Array.from(cardRoot.querySelectorAll(".brsw-damage-roll-row"))
    .map((row) => {
      const label = row.querySelector(".brsw-damage-roll-target")?.textContent?.trim();
      const result = row.querySelector(".brsw-damage-roll-damage")?.textContent?.trim();
      return result ? `**${label || "Damage"}:** ${result}` : "";
    })
    .filter(Boolean);

  // Better Rolls renders the die faces in .brsw-roll-value-total and the target/result
  // interpretation in .brsw-roll-detail. Keep those outcomes while excluding descriptions,
  // modifiers, resource controls, reroll buttons, and the card's other action interface.
  if (isSkillCard) {
    const die = trait?.system?.die?.sides ? `d${trait.system.die.sides}` : "";
    lines.push([traitTitle, die].filter(Boolean).join(" ") || title);
  } else if (title) lines.push(`**${title}**`);
  if (!isSkillCard && traitTitle && traitTitle !== title) lines.push(`**${traitTitle}**`);
  if (rollValues.length) lines.push(`Dice: ${rollValues.join(" | ")}`);
  if (traitNames.length) lines.push(traitNames.join("\n"));
  if (damageRows.length) lines.push(`Damage\n${damageRows.join("\n")}`);

  return normalizeMarkdown(lines.join("\n\n"));
}

function formatRolls(rolls = []) {
  if (!rolls.length) return "";
  return rolls.map((roll) => {
    const data = typeof roll === "string" ? safeJsonParse(roll) : roll;
    const formula = data?.formula || data?._formula || "Roll";
    const total = data?.total ?? data?._total;
    const results = collectResults(data);
    const details = results.length ? ` (${results.join(", ")})` : "";
    return Number.isFinite(Number(total))
      ? `**${formula}: ${total}**${details}`
      : "";
  }).filter(Boolean).join("\n");
}

function collectResults(data) {
  const results = [];
  const visit = (term) => {
    if (!term || typeof term !== "object") return;
    if (Array.isArray(term)) {
      term.forEach(visit);
      return;
    }
    const resultsArray = term.results || term._results;
    if (Array.isArray(resultsArray)) {
      for (const result of resultsArray) {
        if (result?.active === false || result?.discarded) continue;
        const value = result?.result ?? result?.value;
        if (value !== undefined && value !== null) results.push(String(value));
      }
    }
    for (const key of ["terms", "_terms", "rolls", "_rolls"]) {
      if (term[key]) visit(term[key]);
    }
  };
  visit(data);
  return results;
}

function safeJsonParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function convertNodeFromHtml(content) {
  const element = document.createElement("div");
  element.innerHTML = content;
  return convertNode(element);
}

function convertNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\s+/g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node;
  const tag = element.tagName.toLowerCase();
  const children = () => Array.from(element.childNodes).map(convertNode).join("");

  if (["script", "style", "button", "input", "select", "textarea", "svg"].includes(tag)) return "";
  if (element.matches(".targets, .target-list, .apply-damage, .damage-application, [data-action*='apply']")) return "";
  if (tag === "br") return "\n";
  // Chat-card images are usually decorative icons or actor portraits, not roll data.
  if (tag === "img") return "";
  if (tag === "a") {
    const label = children().trim();
    const href = element.getAttribute("href") || "";
    return label ? (href ? `[${label}](${href})` : label) : href;
  }
  if (["strong", "b"].includes(tag)) return wrapInline("**", children());
  if (["em", "i"].includes(tag)) return wrapInline("*", children());
  if (tag === "code") return wrapInline("`", children());
  if (tag === "pre") return `\n\n\`\`\`\n${element.textContent.trim()}\n\`\`\`\n\n`;
  if (tag === "li") return `\n- ${children().trim()}`;
  if (["ul", "ol"].includes(tag)) return `\n${children()}\n`;
  if (["h1", "h2", "h3", "h4"].includes(tag)) {
    const level = Number(tag[1]);
    const text = children().trim();
    return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
  }
  if (["p", "div", "section", "article", "blockquote", "table", "tr"].includes(tag)) {
    return `\n${children().trim()}\n`;
  }
  if (tag === "th" || tag === "td") return ` ${children().trim()} |`;
  return children();
}

function wrapInline(marker, value) {
  const text = value.trim();
  return text ? `${marker}${text}${marker}` : "";
}

function normalizeMarkdown(value) {
  return String(value || "")
    .replace(/\[([^\]]*)\]\(\s*\)/g, "$1")
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/(?<!\*)\*(?:\s*\*)/g, "")
    .replace(/`\s*`/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInline(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value ?? "");
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}
