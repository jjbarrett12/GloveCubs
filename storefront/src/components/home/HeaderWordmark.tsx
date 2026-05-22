"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const HEADER_LOGO_SRC = "/images/glovecubs-header-logo.png";
const HEADER_MARK_SRC = "/images/glovecubs-header-mark-transparent.png";

type HeaderWordmarkProps = {
  className?: string;
  onNavigate?: () => void;
};

/** Primary header wordmark — PNG, then mark, then accessible text fallback. */
export function HeaderWordmark({ className, onNavigate }: HeaderWordmarkProps) {
  const [src, setSrc] = React.useState(HEADER_LOGO_SRC);
  const [textOnly, setTextOnly] = React.useState(false);

  const handleError = () => {
    if (src === HEADER_LOGO_SRC) {
      setSrc(HEADER_MARK_SRC);
      return;
    }
    setTextOnly(true);
  };

  return (
    <Link
      href="/"
      className={cn(
        "flex min-w-0 max-w-full shrink-0 items-center bg-transparent no-underline [forced-color-adjust:none]",
        className,
      )}
      onClick={onNavigate}
    >
      {textOnly ? (
        <span className="text-lg font-black tracking-tight text-[#0a0a0a] sm:text-xl lg:text-[1.35rem]">
          Glove<span className="text-[var(--color-accent-orange)]">Cubs</span>
        </span>
      ) : (
        <Image
          src={src}
          alt="GloveCubs"
          width={1005}
          height={143}
          priority
          unoptimized
          onError={handleError}
          className="h-[34px] w-auto max-w-[min(220px,48vw)] shrink-0 object-contain object-left sm:h-[38px] sm:max-w-[min(260px,55vw)] lg:h-[42px]"
        />
      )}
    </Link>
  );
}
