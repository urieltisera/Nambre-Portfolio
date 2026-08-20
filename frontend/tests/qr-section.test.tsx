// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {groupQrAssets, QrPreviewCard, QrSection} from "../components/BusinessPanel";
import {QRCode} from "../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeAssets(): QRCode[] {
  return [
    {
      id: "standard-png",
      qr_type: "standard",
      asset_url: "/api/businesses/biz/qr-assets/standard.png",
      status: "approved",
    },
    {
      id: "standard-svg",
      qr_type: "standard",
      asset_url: "/api/businesses/biz/qr-assets/standard.svg",
      status: "approved",
    },
    {
      id: "branded-png",
      qr_type: "branded",
      asset_url: "/api/businesses/biz/qr-assets/branded.png",
      status: "approved",
    },
    {
      id: "branded-svg",
      qr_type: "branded",
      asset_url: "/api/businesses/biz/qr-assets/branded.svg",
      status: "approved",
    },
  ];
}

describe("qr section", () => {
  it("groups the QR assets into exactly standard and branded cards", async () => {
    const groups = groupQrAssets(makeAssets());
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:standard-preview")
      .mockReturnValueOnce("blob:branded-preview");
    const revokeObjectURL = vi.fn();
    const loadPreview = vi.fn(async () => new Blob(["png"]));

    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});

    render(
      <QrSection
        canGenerate={true}
        downloadError=""
        downloadAsset={vi.fn(async () => undefined)}
        generatingQr={false}
        groups={groups}
        loadPreview={loadPreview}
        onDownloadError={vi.fn()}
        onGenerateQr={vi.fn(async () => undefined)}
        previewVersion={0}
        publicCode="fixed-code"
        token="token-123"
      />,
    );

    expect(screen.getByText("QR estándar")).toBeTruthy();
    expect(screen.getByText("QR con logo")).toBeTruthy();
    expect(screen.getAllByRole("button", {name: "Descargar PNG"})).toHaveLength(2);
    expect(screen.getAllByRole("button", {name: "Descargar SVG"})).toHaveLength(2);
    expect(screen.getAllByTestId(/qr-card-/)).toHaveLength(2);

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });
    expect(loadPreview).toHaveBeenNthCalledWith(
      1,
      "/api/businesses/biz/qr-assets/standard.png",
      "token-123",
    );
    expect(loadPreview).toHaveBeenNthCalledWith(
      2,
      "/api/businesses/biz/qr-assets/branded.png",
      "token-123",
    );
  });

  it("shows a suspended read-only message when QR generation is blocked", () => {
    render(
      <QrSection
        canGenerate={false}
        downloadError=""
        downloadAsset={vi.fn(async () => undefined)}
        generatingQr={false}
        groups={groupQrAssets([])}
        loadPreview={vi.fn(async () => new Blob(["png"]))}
        onDownloadError={vi.fn()}
        onGenerateQr={vi.fn(async () => undefined)}
        previewVersion={0}
        publicCode="fixed-code"
        token="token-123"
      />,
    );

    expect(screen.getByText(/Reactivalo desde Admin/)).toBeTruthy();
    expect(screen.getByRole("button", {name: "Generar QR"}).hasAttribute("disabled")).toBe(true);
  });

  it("loads the preview through an authenticated blob flow instead of direct asset url", async () => {
    const loadPreview = vi.fn(async () => new Blob(["png"]));
    const createObjectURL = vi.fn(() => "blob:standard-preview");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});

    render(
      <QrPreviewCard
        group={groupQrAssets(makeAssets())[0]}
        loadPreview={loadPreview}
        onDownloadError={vi.fn()}
        previewVersion={0}
        token="owner-token"
      />,
    );

    await waitFor(() => {
      expect(loadPreview).toHaveBeenCalledWith(
        "/api/businesses/biz/qr-assets/standard.png",
        "owner-token",
      );
    });

    const image = await screen.findByAltText("Preview QR estándar");
    expect(image.getAttribute("src")).toBe("blob:standard-preview");
    expect(image.getAttribute("src")).not.toContain("/api/businesses/biz/qr-assets/standard.png");
  });

  it("shows a safe preview error and keeps download buttons available", async () => {
    const loadPreview = vi.fn(async () => {
      throw new Error("backend exploded");
    });

    render(
      <QrPreviewCard
        group={groupQrAssets(makeAssets())[1]}
        loadPreview={loadPreview}
        onDownloadError={vi.fn()}
        previewVersion={0}
        token="owner-token"
      />,
    );

    expect(screen.getByText("Cargando vista previa...")).toBeTruthy();
    expect(await screen.findByText("No se pudo cargar la vista previa del QR.")).toBeTruthy();
    const card = screen.getByTestId("qr-card-branded");
    expect(within(card).getByRole("button", {name: "Descargar PNG"})).toBeTruthy();
    expect(within(card).getByRole("button", {name: "Descargar SVG"})).toBeTruthy();
  });

  it("keeps PNG and SVG downloads authenticated from each card", async () => {
    const downloadAsset = vi.fn(async () => undefined);
    const onDownloadError = vi.fn();
    const createObjectURL = vi.fn(() => "blob:branded-preview");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});

    render(
      <QrPreviewCard
        downloadAsset={downloadAsset}
        group={groupQrAssets(makeAssets())[1]}
        loadPreview={vi.fn(async () => new Blob(["png"]))}
        onDownloadError={onDownloadError}
        previewVersion={0}
        token="owner-token"
      />,
    );

    const card = screen.getByTestId("qr-card-branded");
    await within(card).findByAltText("Preview QR con logo");
    fireEvent.click(within(card).getByRole("button", {name: "Descargar PNG"}));
    fireEvent.click(within(card).getByRole("button", {name: "Descargar SVG"}));

    await waitFor(() => {
      expect(downloadAsset).toHaveBeenNthCalledWith(
        1,
        "/api/businesses/biz/qr-assets/branded.png",
        "owner-token",
      );
      expect(downloadAsset).toHaveBeenNthCalledWith(
        2,
        "/api/businesses/biz/qr-assets/branded.svg",
        "owner-token",
      );
    });
    expect(onDownloadError).toHaveBeenCalledWith("");
  }, 15000);

  it("revokes preview object urls on cleanup", async () => {
    const createObjectURL = vi.fn(() => "blob:cleanup");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});

    const {unmount} = render(
      <QrPreviewCard
        group={groupQrAssets(makeAssets())[0]}
        loadPreview={vi.fn(async () => new Blob(["png"]))}
        onDownloadError={vi.fn()}
        previewVersion={0}
        token="owner-token"
      />,
    );

    await screen.findByAltText("Preview QR estándar");
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cleanup");
  });

  it("reloads and replaces the branded preview blob after regeneration", async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:branded-a")
      .mockReturnValueOnce("blob:branded-b");
    const revokeObjectURL = vi.fn();
    const loadPreview = vi
      .fn()
      .mockResolvedValueOnce(new Blob(["logo-a"]))
      .mockResolvedValueOnce(new Blob(["logo-b"]));

    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});

    const {rerender} = render(
      <QrPreviewCard
        group={groupQrAssets(makeAssets())[1]}
        loadPreview={loadPreview}
        onDownloadError={vi.fn()}
        previewVersion={0}
        token="owner-token"
      />,
    );

    const firstPreview = await screen.findByAltText("Preview QR con logo");
    expect(firstPreview.getAttribute("src")).toBe("blob:branded-a");
    expect(loadPreview).toHaveBeenNthCalledWith(
      1,
      "/api/businesses/biz/qr-assets/branded.png",
      "owner-token",
    );

    rerender(
      <QrPreviewCard
        group={groupQrAssets(makeAssets())[1]}
        loadPreview={loadPreview}
        onDownloadError={vi.fn()}
        previewVersion={1}
        token="owner-token"
      />,
    );

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:branded-a");
    });
    const secondPreview = await screen.findByAltText("Preview QR con logo");
    expect(secondPreview.getAttribute("src")).toBe("blob:branded-b");
    expect(loadPreview).toHaveBeenNthCalledWith(
      2,
      "/api/businesses/biz/qr-assets/branded.png",
      "owner-token",
    );
  });
});
