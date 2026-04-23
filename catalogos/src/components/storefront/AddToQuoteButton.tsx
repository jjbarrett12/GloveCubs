"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useQuoteBasket } from "@/contexts/QuoteBasketContext";

export interface AddToQuoteButtonProps {
  productId: string;
  /** Explicit catalog UUID for quote snapshots; defaults to productId. */
  canonicalProductId?: string;
  slug: string;
  name: string;
  unitPrice?: number | null;
  sku?: string | null;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** If true, add and navigate to /quote */
  goToQuote?: boolean;
  children?: React.ReactNode;
}

export function AddToQuoteButton({
  productId,
  canonicalProductId,
  slug,
  name,
  unitPrice,
  sku,
  variant = "secondary",
  size = "default",
  className,
  goToQuote = false,
  children,
}: AddToQuoteButtonProps) {
  const { addItem } = useQuoteBasket();
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem({
      productId,
      canonicalProductId: canonicalProductId ?? productId,
      slug,
      name,
      notes: "",
      unitPrice,
      sku,
      quantity: 1,
    });
    if (goToQuote) router.push("/quote");
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick} type="button">
      {children ?? (goToQuote ? "Request quote" : "Add to quote list")}
    </Button>
  );
}
