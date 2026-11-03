"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on mobile, centered dialog on desktop. Built on Radix Dialog
 * for focus trapping, escape-to-close and screen-reader semantics.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col border border-line-strong bg-surface shadow-2xl outline-none",
            "inset-x-0 bottom-0 rounded-t-[28px] data-[state=open]:animate-slide-up",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px]",
            size === "lg" ? "md:max-w-2xl" : "md:max-w-lg",
            className
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-surface-4 md:hidden" />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted hover:text-fg" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
          {footer && <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
