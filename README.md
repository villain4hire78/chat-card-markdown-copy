# Chat Card Markdown Copy

A small, LLM-agnostic Foundry VTT module that adds a copy button to each visible chat card. Clicking it copies the speaker, timestamp, and card content as Markdown, including rendered roll totals and system-specific card text when present.

The module runs entirely in the Foundry client. It does not call an AI service, use an API key, or require a hosted bridge.

## Install

Install from Foundry's **Install Module** screen using this manifest URL:

`https://github.com/villain4hire78/chat-card-markdown-copy/releases/latest/download/module.json`

After installation, enable **Chat Card Markdown Copy** in the world's Module Management screen.

## Updating

Foundry checks the manifest for new releases. Create a GitHub release with the version in `module.json` as its tag and attach a ZIP containing the module files at its root. The release must include `module.json` and the `scripts/` and `styles/` folders.

## Usage

Click the copy icon in a chat card's header, then paste the Markdown into ChatGPT, another LLM, a note, or any text editor. Private messages remain subject to Foundry's normal visibility rules; the button is hidden when the message content is not visible to the current user.
