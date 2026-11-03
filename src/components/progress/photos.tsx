"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, ImagePlus, Lock, Trash2, Columns2 } from "lucide-react";
import { getDB } from "@/lib/db/db";
import { addPhoto, deletePhoto } from "@/lib/db/repo";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useLoadedData } from "@/components/providers/data-provider";
import type { PhotoPose, ProgressPhoto } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { toast } from "@/lib/events";

/** Downscale to ≤1600px JPEG so photos stay small inside IndexedDB. */
async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Compression failed"))), "image/jpeg", 0.85));
  return { blob, width, height };
}

function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function Photo({ photo, className, onClick }: { photo: ProgressPhoto; className?: string; onClick?: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" onClick={onClick} className={`relative overflow-hidden rounded-2xl bg-surface-3 ${className ?? ""}`} aria-label={`${photo.pose} photo from ${formatDate(photo.date)}`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
        {formatDate(photo.date)} · {photo.pose}
      </span>
    </button>
  );
}

export function PhotosPanel() {
  const { today } = useLoadedData();
  const photos = useLiveQuery(() => getDB().photos.orderBy("date").toArray(), []);
  const [pose, setPose] = React.useState<PhotoPose>("front");
  const [date, setDate] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const [viewing, setViewing] = React.useState<ProgressPhoto | null>(null);
  const [comparePose, setComparePose] = React.useState<PhotoPose>("front");
  const [split, setSplit] = React.useState(50);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ kind: "error", title: "Please choose an image file" });
    setBusy(true);
    try {
      const { blob, width, height } = await compressImage(file);
      await addPhoto(date, pose, blob, width, height);
      toast({ kind: "success", title: "Photo saved privately on this device" });
    } catch (err) {
      toast({ kind: "error", title: "Couldn't save photo", detail: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const ofPose = (photos ?? []).filter((p) => p.pose === comparePose);
  const first = ofPose[0];
  const latest = ofPose.at(-1);
  const firstUrl = useObjectUrl(first?.blob);
  const latestUrl = useObjectUrl(latest?.blob);
  const byDate = new Map<string, ProgressPhoto[]>();
  [...(photos ?? [])].reverse().forEach((p) => byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <CardHeader title="Add a photo" subtitle="Same light, same spot, every 2–4 weeks" icon={<Camera size={16} />} />
        <div className="space-y-3">
          <Segmented<PhotoPose>
            value={pose}
            onChange={setPose}
            options={[
              { value: "front", label: "Front" },
              { value: "side", label: "Side" },
              { value: "back", label: "Back" },
            ]}
            size="sm"
          />
          <Field label="Date" htmlFor="photo-date">
            <Input id="photo-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          </Field>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <Button size="lg" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus size={18} /> {busy ? "Saving…" : "Choose photo"}
          </Button>
          <p className="flex items-start gap-2 text-xs text-subtle">
            <Lock size={13} className="mt-px shrink-0" /> Photos never leave this device. Body fat is never estimated from photos.
          </p>
        </div>
      </Card>

      <Card className="lg:col-span-7">
        <CardHeader
          title="Compare"
          subtitle={first && latest && first.id !== latest.id ? `${formatDate(first.date)} → ${formatDate(latest.date)}` : "Add two photos of the same pose to compare"}
          icon={<Columns2 size={16} />}
          action={
            <Segmented<PhotoPose>
              value={comparePose}
              onChange={setComparePose}
              options={[
                { value: "front", label: "Front" },
                { value: "side", label: "Side" },
                { value: "back", label: "Back" },
              ]}
              size="sm"
              className="w-48"
            />
          }
        />
        {first && latest && first.id !== latest.id && firstUrl && latestUrl ? (
          <>
            <div className="relative mx-auto aspect-[3/4] max-h-[460px] overflow-hidden rounded-2xl bg-surface-3 select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latestUrl} alt="Latest" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={firstUrl} alt="Start" className="absolute inset-0 h-full w-full object-cover" />
              </div>
              <div className="absolute inset-y-0 w-0.5 bg-lime shadow-[0_0_12px_var(--color-lime)]" style={{ left: `${split}%` }} />
              <span className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white">Start</span>
              <span className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white">Latest</span>
            </div>
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="mt-3 w-full accent-[var(--color-lime)]" aria-label="Comparison slider" />
          </>
        ) : (
          <EmptyState icon={<Columns2 size={22} />} title="Nothing to compare yet" description="Your first photo becomes the baseline. Add another later to see the difference." />
        )}
      </Card>

      <Card className="lg:col-span-12">
        <CardHeader title="All photos" subtitle={`${photos?.length ?? 0} photos`} />
        {!photos?.length ? (
          <EmptyState icon={<Camera size={22} />} title="No photos yet" description="Take a starting photo — future you will be glad you did." />
        ) : (
          <div className="space-y-5">
            {[...byDate.entries()].map(([d, list]) => (
              <div key={d}>
                <p className="mb-2 text-sm font-medium text-muted">{formatDate(d, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {list.map((p) => (
                    <Photo key={p.id} photo={p} className="aspect-[3/4]" onClick={() => setViewing(p)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing ? `${formatDate(viewing.date, { month: "long", day: "numeric", year: "numeric" })} · ${viewing.pose}` : ""}>
        {viewing && (
          <>
            <Photo photo={viewing} className="aspect-[3/4] w-full" />
            <Button
              variant="danger"
              className="mt-4 w-full"
              onClick={async () => {
                if (!confirm("Delete this photo permanently?")) return;
                await deletePhoto(viewing.id);
                setViewing(null);
              }}
            >
              <Trash2 size={16} /> Delete photo
            </Button>
          </>
        )}
      </Sheet>
    </div>
  );
}
