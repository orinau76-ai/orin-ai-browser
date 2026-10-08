<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Live voice runs through a persistent WebSocket relay at /api/live (src/lib/live-relay.server.ts, dispatched in src/server.ts and live-vite-plugin.ts in dev); safe voice tasks (search, research, browsing) start immediately; purchases, form submits, messages and deletions run only after the user's spoken yes or Approve tap — keeps consequential actions user-confirmed while automation feels real-time.
- Camera/screen capture is browser-owned and permission-based; selected JPEG frames join the voice relay's full backend history, never the audio transport or persistent storage, because Live accepts audio/text rather than images.
