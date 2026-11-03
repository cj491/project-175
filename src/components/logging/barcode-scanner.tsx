"use client";

import * as React from "react";
import { CameraOff, ScanLine } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => DetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

/**
 * Camera barcode scanner. Uses the native BarcodeDetector (Chrome/Android)
 * when available, otherwise the ZXing library (Safari/iOS, Firefox).
 * The camera feed is processed locally and never uploaded.
 */
export function BarcodeScanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [status, setStatus] = React.useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const onDetectedRef = React.useRef(onDetected);
  React.useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let zxingStop: (() => void) | null = null;
    let done = false;
    const found = (code: string) => {
      if (done || cancelled) return;
      done = true;
      navigator.vibrate?.(60);
      onDetectedRef.current(code);
    };

    (async () => {
      setStatus("starting");
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera isn't available in this browser");
        const video = videoRef.current;
        if (!video) return;
        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (cancelled) return;
          video.srcObject = stream;
          await video.play();
          const detector = new Native({ formats: FORMATS });
          setStatus("scanning");
          timer = setInterval(async () => {
            if (video.readyState < 2) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) found(codes[0].rawValue);
            } catch {
              /* frame not ready */
            }
          }, 250);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (result) => {
            if (result) found(result.getText());
          });
          if (cancelled) controls.stop();
          zxingStop = () => controls.stop();
          setStatus("scanning");
        }
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string }).name;
        setStatus("error");
        setError(
          name === "NotAllowedError"
            ? "Camera permission was declined. You can allow it in your browser settings, or type the barcode below."
            : name === "NotFoundError"
              ? "No camera found. Type the barcode below instead."
              : `Couldn't start the camera (${(e as Error).message}). Type the barcode below instead.`
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.replace(/\D/g, "");
    if (code.length >= 6) onDetected(code);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Scan a barcode" description="Point your camera at the barcode on the package">
      <div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label="Camera preview" />
        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative h-28 w-64 rounded-2xl border-2 border-lime/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-lime" />
            </div>
          </div>
        )}
        {status === "starting" && <p className="absolute inset-0 grid place-items-center text-sm text-muted">Starting camera…</p>}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <CameraOff className="mx-auto mb-2 text-muted" />
              <p className="text-sm text-muted">{error}</p>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={submitManual} className="flex items-end gap-2">
        <Field label="Or enter the barcode number" className="flex-1" htmlFor="bc-manual">
          <Input id="bc-manual" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 0894700010137" maxLength={14} />
        </Field>
        <Button type="submit" variant="secondary" className="h-12" disabled={manual.replace(/\D/g, "").length < 6}>
          <ScanLine size={16} /> Look up
        </Button>
      </form>
      <p className="mt-3 text-xs text-subtle">Product data comes from Open Food Facts, a community database — double-check values against the label.</p>
    </Sheet>
  );
}
