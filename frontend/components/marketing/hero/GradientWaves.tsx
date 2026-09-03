"use client";

import React from "react";
import {useEffect, useRef, useState} from "react";
import {Mesh, Program, Renderer, Triangle} from "ogl";

const DPR_MAX = 1.5;

const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

float wave(vec2 p, float speed, float scale, float weight) {
  return sin((p.x * scale) + (p.y * weight) + (uTime * speed));
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  float depth = 0.0;
  depth += wave(p, 0.22, 7.0, 4.0) * 0.32;
  depth += wave(p.yx + vec2(0.18, -0.12), -0.18, 9.5, 3.5) * 0.24;
  depth += wave(p + vec2(0.0, 0.28), 0.12, 14.0, 5.0) * 0.12;
  depth = smoothstep(-0.55, 0.72, depth);

  vec3 deepTeal = vec3(0.020, 0.155, 0.145);
  vec3 coldTeal = vec3(0.040, 0.510, 0.485);
  vec3 cream = vec3(0.955, 0.960, 0.915);
  vec3 terracotta = vec3(0.735, 0.310, 0.220);

  float radial = 1.0 - smoothstep(0.08, 0.86, length(p));
  float highlight = smoothstep(0.64, 1.0, depth) * radial;
  float accent = smoothstep(0.86, 1.0, depth + (p.x * 0.22) - (p.y * 0.14)) * 0.22;

  vec3 color = mix(deepTeal, coldTeal, depth);
  color = mix(color, cream, highlight * 0.34);
  color = mix(color, terracotta, accent);

  float alpha = 0.82 * smoothstep(0.02, 0.24, vUv.x) * (1.0 - smoothstep(0.76, 1.0, vUv.y));
  gl_FragColor = vec4(color, alpha);
}
`;

function canUseWebGL() {
  if (typeof window === "undefined") {
    return false;
  }

  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GradientWaves() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || disabled || !canUseWebGL()) {
      return;
    }

    let disposed = false;
    let visible = true;
    let tabVisible = document.visibilityState !== "hidden";
    let frame = 0;
    let renderer: Renderer | null = null;
    let mesh: Mesh | null = null;
    let program: Program | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;

    const stop = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const failToFallback = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderer?.gl.canvas.removeEventListener("webglcontextlost", onContextLost);
      renderer?.gl.getExtension("WEBGL_lose_context")?.loseContext();
      renderer?.gl.canvas.remove();
      renderer = null;
      mesh = null;
      program = null;
      setDisabled(true);
    };

    const render = (time: number) => {
      if (disposed || !renderer) {
        return;
      }

      if (program) {
        program.uniforms.uTime.value = time * 0.001;
      }

      if (mesh) {
        renderer.render({scene: mesh});
      }
      frame = visible && tabVisible ? window.requestAnimationFrame(render) : 0;
    };

    function schedule() {
      if (!disposed && visible && tabVisible && !frame) {
        frame = window.requestAnimationFrame(render);
      }
    }

    function onVisibilityChange() {
      tabVisible = document.visibilityState !== "hidden";
      if (tabVisible) {
        schedule();
      } else {
        stop();
      }
    }

    function onContextLost(event: Event) {
      event.preventDefault();
      failToFallback();
    }

    try {
      renderer = new Renderer({
        alpha: true,
        antialias: false,
        depth: false,
        dpr: Math.min(window.devicePixelRatio || 1, DPR_MAX),
      });

      const {gl} = renderer;
      gl.clearColor(0, 0, 0, 0);
      gl.canvas.className = "marketing-gradient-waves";
      gl.canvas.addEventListener("webglcontextlost", onContextLost, false);
      host.appendChild(gl.canvas);

      const geometry = new Triangle(gl);
      program = new Program(gl, {
        depthTest: false,
        depthWrite: false,
        fragment,
        transparent: true,
        uniforms: {
          uResolution: {value: [1, 1]},
          uTime: {value: 0},
        },
        vertex,
      });
      mesh = new Mesh(gl, {geometry, program});

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        renderer?.setSize(width, height);
        if (program) {
          program.uniforms.uResolution.value = [width, height];
        }
      };

      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);

      intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) {
          schedule();
        } else {
          stop();
        }
      });
      intersectionObserver.observe(host);

      document.addEventListener("visibilitychange", onVisibilityChange);
      schedule();
    } catch {
      failToFallback();
    }

    cleanupRef.current = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderer?.gl.canvas.removeEventListener("webglcontextlost", onContextLost);
      renderer?.gl.canvas.remove();
      renderer = null;
      mesh = null;
      program = null;
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [disabled]);

  if (disabled) {
    return null;
  }

  return <div className="marketing-gradient-waves-host" data-testid="gradient-waves-host" ref={hostRef} />;
}
