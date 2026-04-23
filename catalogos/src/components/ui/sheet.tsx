"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheet() {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("Sheet components must be used within Sheet");
  return ctx;
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  return <SheetContext.Provider value={{ open, onOpenChange }}>{children}</SheetContext.Provider>;
}

function SheetTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { onOpenChange } = useSheet();
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => onOpenChange(true),
    });
  }
  return <div onClick={() => onOpenChange(true)}>{children}</div>;
}

const SheetContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { side?: "right" | "left" }>(
  ({ className, side = "right", children, ...props }, ref) => {
    const { open, onOpenChange } = useSheet();
    if (!open) return null;
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => onOpenChange(false)} aria-hidden />
        <div
          ref={ref}
          className={cn(
            "fixed top-0 z-50 h-full w-full max-w-lg overflow-auto border-border bg-background shadow-lg",
            side === "right" ? "right-0" : "left-0",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4 border-b border-border", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
);
SheetTitle.displayName = "SheetTitle";

const SheetBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-4 space-y-4", className)} {...props} />
);
SheetBody.displayName = "SheetBody";

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetBody };
