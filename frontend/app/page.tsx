import React from "react";
import Link from "next/link";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";

export default function Page() {
  return (
    <AppearanceProvider key="public-home">
      <main className="login-screen">
        <div className="login-screen__backdrop" />
        <Card className="login-card">
          <NambreBrand className="login-card__brand" />
          <div className="login-card__header">
            <h1>Nambre</h1>
            <p>Una superficie pública mínima preparada para la futura landing comercial.</p>
          </div>
          <div className="actions">
            <Link className="ui-button ui-button--primary" href="/login">
              Ingresar
            </Link>
            <Button disabled variant="ghost">
              Landing en preparación
            </Button>
          </div>
        </Card>
      </main>
    </AppearanceProvider>
  );
}
