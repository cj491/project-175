import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        primary: "bg-lime text-lime-ink hover:bg-lime-strong shadow-[0_0_0_1px_rgb(212_255_58/0.4),0_8px_24px_-8px_rgb(212_255_58/0.5)]",
        secondary: "bg-surface-3 text-fg hover:bg-surface-4 border border-line",
        ghost: "text-muted hover:text-fg hover:bg-surface-3",
        outline: "border border-line-strong text-fg hover:bg-surface-3",
        danger: "bg-rose/10 text-rose hover:bg-rose/20 border border-rose/20",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-xl",
        md: "h-11 px-4 text-[15px] rounded-2xl",
        lg: "h-14 px-6 text-base rounded-2xl",
        icon: "h-10 w-10 rounded-xl",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";

export { buttonVariants };
