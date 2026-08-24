"use client";

import Link from "next/link";
import React from "react";

export function PublicMenuFooter() {
  return (
    <footer className="public-menu-footer">
      <p>Una carta pensada para móvil, sin descuidar la legibilidad.</p>
      <Link href="/">Powered by Nambre</Link>
    </footer>
  );
}
