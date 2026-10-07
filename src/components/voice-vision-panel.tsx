import type { RefObject } from "react";
import { Camera, CameraOff, MonitorUp, Mic, MicOff, PhoneOff, ScanEye, Loader2, X, Check, Square, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";

type Draft = { prompt: string; mode: string; steps: string[]; needs_approval_reason: string };
export function VoiceVisionPanel(props: {
  open: boolean;
  status: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  source: string | null;
  pending: boolean;
  muted: boolean;
  playbackBlocked: boolean;
  visualBusy: boolean;
  visualAnswer: string;
  captions: { role: string; text: string }[];
  error: string | null;
  draft: Draft | null;
  busy: boolean;
  viewerUrl: string | null;
  phase: string;
  onShare: (source: "camera" | "screen") => void;
  onStopSharing: () => void;
  onLook: () => void;
  onMute: () => void;
  onEnd: () => void;
  onMinimize: () => void;
  onPlay: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <section role="dialog" aria-modal="true" aria-label="Orin Live" className="fixed inset-0 z-50 flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3"><AudioLines className="size-5 text-primary" /><h1 className="text-lg font-semibold">Orin Live</h1><span className="text-xs capitalize text-muted-foreground">{props.status}</span></div>
        <Button variant="ghost" size="icon" onClick={props.onMinimize} title="Minimize" aria-label="Minimize voice"><X /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0 space-y-5">
            <div className="relative flex min-h-48 items-center justify-center overflow-hidden bg-muted aspect-video">
              <video ref={props.videoRef} muted autoPlay playsInline aria-label="Shared video" className={`h-full w-full object-contain ${props.source ? "" : "hidden"}`} />
              {!props.source ? <div className="flex flex-col items-center gap-4"><AudioLines className={`size-14 text-primary ${props.status === "connected" ? "animate-pulse motion-reduce:animate-none" : ""}`} /><span className="text-sm text-muted-foreground">{props.status === "connecting" ? "Connecting…" : "Voice conversation"}</span></div> : null}
              {props.source ? <span className="absolute bottom-3 left-3 bg-background/90 px-2 py-1 text-xs capitalize">{props.source} shared</span> : null}
            </div>
            {props.viewerUrl ? <div><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Agent browser</span><a href={props.viewerUrl} target="_blank" rel="noreferrer">Open browser</a></div><iframe title="Agent live browser" src={props.viewerUrl} sandbox="allow-scripts allow-same-origin" className="aspect-video w-full border border-border" /></div> : null}
            {props.visualAnswer ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{props.visualAnswer}</p> : null}
            {props.error ? <p role="alert" className="text-sm text-destructive">{props.error}</p> : null}
          </div>
          <div className="min-w-0 space-y-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="size-2 rounded-full bg-primary" />{props.busy ? props.phase || "Working…" : props.visualBusy ? "Looking…" : props.status === "connected" ? "Listening" : "Ready"}</div>
            <div aria-live="polite" aria-label="Conversation captions" className="space-y-4">
              {props.captions.slice(-8).map((caption, i) => <div key={i}><div className="mb-1 text-xs font-semibold text-muted-foreground">{caption.role === "user" ? "You" : "Orin"}</div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{caption.text}</p></div>)}
            </div>
            {props.draft ? <div className="border-t border-border pt-5">
              <div className="mb-2 text-xs font-semibold uppercase text-primary">Awaiting approval</div>
              <p className="mb-4 text-sm font-medium">{props.draft.prompt}</p>
              <ol className="space-y-3">{props.draft.steps.map((step, i) => <li key={i} className="flex gap-3 text-sm"><span className="mt-1 size-3 shrink-0 rounded-full border-2 border-primary" />{step}</li>)}</ol>
              {props.draft.needs_approval_reason ? <p className="mt-4 text-xs text-muted-foreground">{props.draft.needs_approval_reason}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2"><Button onClick={props.onApprove} disabled={props.busy}><Check />Approve & run</Button><Button variant="outline" onClick={props.onDecline}><X />Decline</Button></div>
            </div> : null}
            {props.busy ? <Button variant="destructive" onClick={props.onCancel}><Square />Cancel task</Button> : null}
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-border px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <Button variant={props.muted ? "secondary" : "outline"} size="icon" onClick={props.onMute} disabled={props.status !== "connected"} aria-label={props.muted ? "Unmute microphone" : "Mute microphone"} title={props.muted ? "Unmute microphone" : "Mute microphone"}>{props.muted ? <MicOff /> : <Mic />}</Button>
        <Button variant="outline" size="icon" onClick={() => props.onShare("camera")} disabled={props.pending} aria-label="Share camera" title="Share camera"><Camera /></Button>
        <Button variant="outline" size="icon" onClick={() => props.onShare("screen")} disabled={props.pending} aria-label="Share screen" title="Share screen"><MonitorUp /></Button>
        {props.source ? <Button variant="outline" size="icon" onClick={props.onStopSharing} aria-label="Stop sharing" title="Stop sharing"><CameraOff /></Button> : null}
        <Button variant="secondary" onClick={props.onLook} disabled={!props.source || props.status !== "connected" || props.visualBusy}>{props.visualBusy ? <Loader2 className="animate-spin" /> : <ScanEye />}Look</Button>
        {props.playbackBlocked ? <Button onClick={props.onPlay}>Play audio</Button> : null}
        <Button variant="destructive" onClick={props.onEnd}><PhoneOff />End</Button>
      </footer>
    </section>
  );
}