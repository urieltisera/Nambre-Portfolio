// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import Page from "../app/page";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    currentUser: mocks.currentUser,
  };
});

vi.mock("@/components/LoginForm", () => ({
  LoginForm: ({onToken}: {onToken: (token: string) => void}) => (
    <button onClick={() => void onToken("owner-token")}>Mock login</button>
  ),
}));

vi.mock("@/components/BusinessPanel", () => ({
  BusinessPanel: () => <div>Business panel</div>,
}));

vi.mock("@/components/AdminPanel", () => ({
  AdminPanel: () => <div>Admin panel</div>,
}));

afterEach(() => {
  cleanup();
  mocks.currentUser.mockReset();
});

describe("Page", () => {
  it("does not render the Admin tab for a normal owner", async () => {
    mocks.currentUser.mockResolvedValue({
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    });

    render(<Page />);
    fireEvent.click(screen.getByRole("button", {name: "Mock login"}));

    await waitFor(() => {
      expect(mocks.currentUser).toHaveBeenCalledWith("owner-token");
    });
    expect(screen.getByText("Business panel")).toBeTruthy();
    expect(screen.queryByRole("button", {name: "Admin"})).toBeNull();
  });
});
