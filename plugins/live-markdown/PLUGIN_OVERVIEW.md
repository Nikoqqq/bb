Format Markdown as you type in the prompt box, while bb sends exactly the text you typed.

Disabled by default. Enable **Live Markdown** in Settings → Plugins or run
`bb plugin enable bb--live-markdown`.

## What you get

- Headings, **bold**, _italic_, and `code` display formatted in every prompt box.
- Bullets display as dots; numbered items keep the numbers you typed.
- The line holding the caret shows its `#`, `**`, `` ` `` and `- `, so you always edit the real text.

## How it works

The plugin only paints: it never rewrites the draft, so drafts, history, and sent messages contain exactly the Markdown you typed. Mention pills are never formatted, and fenced code blocks stay plain.
