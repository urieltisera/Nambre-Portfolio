"use client";

import React, {useEffect, useRef} from "react";
import {X} from "lucide-react";
import {MenuFlowBrand} from "@/components/brand/MenuFlowBrand";
import {Button} from "@/components/ui/Button";

export function MobileDrawer({
  children,
  onClose,
  open,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="mobile-drawer" role="presentation">
      <button
        aria-label="Cerrar menú"
        className="mobile-drawer__overlay"
        onClick={onClose}
        type="button"
      />
      <div aria-label={title} className="mobile-drawer__panel" role="dialog" aria-modal="true">
        <div className="mobile-drawer__header">
          <MenuFlowBrand />
          <Button
            aria-label="Cerrar menú"
            onClick={onClose}
            ref={closeButtonRef}
            variant="ghost"
          >
            <X size={18} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
