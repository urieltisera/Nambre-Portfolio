import type {Metadata} from "next";
import {absoluteUrl} from "@/lib/site";
import type {PublicDigitalMenuPage} from "@/lib/api";
import {PublicMenuPage} from "@/components/public-menu/PublicMenuPage";
import {PublicMenuState} from "@/components/public-menu/PublicMenuState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicMenuRouteProps = {
  params: Promise<{publicCode: string}>;
};

async function fetchPublicMenuData(publicCode: string): Promise<{
  data: PublicDigitalMenuPage | null;
  status: number;
}> {
  const response = await fetch(absoluteUrl(`/api/public/digital-menus/${publicCode}`), {
    cache: "no-store",
  });
  if (!response.ok) {
    return {data: null, status: response.status};
  }
  return {
    data: (await response.json()) as PublicDigitalMenuPage,
    status: response.status,
  };
}

export async function generateMetadata({
  params,
}: PublicMenuRouteProps): Promise<Metadata> {
  const resolvedParams = await params;
  const {data} = await fetchPublicMenuData(resolvedParams.publicCode);
  const title = data ? `${data.business.name} | Nambre` : "Carta no disponible | Nambre";
  const description = data
    ? `Explorá la carta digital de ${data.business.name} desde Nambre.`
    : "Esta carta no se encuentra disponible actualmente.";
  return {
    title,
    description,
    robots: {
      follow: false,
      index: false,
    },
  };
}

export default async function PublicMenuRoute({
  params,
}: PublicMenuRouteProps) {
  const resolvedParams = await params;
  const {data, status} = await fetchPublicMenuData(resolvedParams.publicCode);

  if (status === 404) {
    return (
      <div>
        <PublicMenuState
          description="No encontramos una carta pública para este enlace."
          title="Carta no encontrada"
        />
      </div>
    );
  }

  if (data === null) {
    return (
      <div>
        <PublicMenuState
          description="Este menú no se encuentra disponible actualmente."
          title="Carta no disponible"
        />
      </div>
    );
  }

  return (
    <div>
      <PublicMenuPage data={data} />
    </div>
  );
}
