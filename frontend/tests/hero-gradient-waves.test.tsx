// @vitest-environment jsdom

import React from "react";
import {cleanup, render, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {GradientWaves} from "../components/marketing/hero/GradientWaves";

const oglMocks = vi.hoisted(() => ({
  latestCanvas: null as HTMLCanvasElement | null,
  render: vi.fn(),
  setSize: vi.fn(),
  renderer: vi.fn(),
}));

vi.mock("ogl", () => ({
  Mesh: vi.fn(() => ({})),
  Program: vi.fn((_gl, options) => ({uniforms: options.uniforms})),
  Renderer: oglMocks.renderer,
  Triangle: vi.fn(() => ({})),
}));

const intersectionObservers: MockIntersectionObserver[] = [];
const resizeObservers: MockResizeObserver[] = [];
let rafCallback: FrameRequestCallback | null = null;

class MockIntersectionObserver {
  readonly callback: IntersectionObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    intersectionObservers.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([{isIntersecting} as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

class MockResizeObserver {
  readonly callback: ResizeObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  intersectionObservers.length = 0;
  resizeObservers.length = 0;
  rafCallback = null;
  oglMocks.latestCanvas = null;
  oglMocks.render.mockReset();
  oglMocks.setSize.mockReset();
  oglMocks.renderer.mockImplementation(() => {
    const canvas = document.createElement("canvas");
    oglMocks.latestCanvas = canvas;

    return {
      gl: {
        canvas,
        clearColor: vi.fn(),
        getExtension: vi.fn(() => null),
      },
      render: oglMocks.render,
      setSize: oglMocks.setSize,
    };
  });

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    rafCallback = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GradientWaves", () => {
  it("does not initialize WebGL for reduced-motion users", () => {
    setReducedMotion(true);

    const {container} = render(<GradientWaves />);

    expect(oglMocks.renderer).not.toHaveBeenCalled();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders a canvas enhancement and pauses when the hero leaves the viewport", async () => {
    const {container, unmount} = render(<GradientWaves />);

    await waitFor(() => {
      expect(oglMocks.renderer).toHaveBeenCalledWith(expect.objectContaining({dpr: expect.any(Number)}));
    });

    expect(container.querySelector("canvas.marketing-gradient-waves")).toBeTruthy();
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    intersectionObservers[0].trigger(false);

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);

    unmount();
    expect(intersectionObservers[0].disconnect).toHaveBeenCalled();
    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
  });

  it("downgrades to fallback when initialization fails", async () => {
    oglMocks.renderer.mockImplementationOnce(() => {
      throw new Error("webgl unavailable");
    });

    const {queryByTestId} = render(<GradientWaves />);

    await waitFor(() => {
      expect(queryByTestId("gradient-waves-host")).toBeNull();
    });
  });

  it("downgrades permanently after webglcontextlost", async () => {
    const {queryByTestId} = render(<GradientWaves />);

    await waitFor(() => {
      expect(oglMocks.latestCanvas).toBeTruthy();
    });

    oglMocks.latestCanvas?.dispatchEvent(new Event("webglcontextlost", {cancelable: true}));

    await waitFor(() => {
      expect(queryByTestId("gradient-waves-host")).toBeNull();
    });
  });

  it("stops while the tab is hidden and resumes when visible", async () => {
    render(<GradientWaves />);

    await waitFor(() => {
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });

    Object.defineProperty(document, "visibilityState", {configurable: true, value: "hidden"});
    document.dispatchEvent(new Event("visibilitychange"));
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);

    Object.defineProperty(document, "visibilityState", {configurable: true, value: "visible"});
    document.dispatchEvent(new Event("visibilitychange"));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);

    rafCallback?.(160);
    expect(oglMocks.render).toHaveBeenCalled();
  });
});
