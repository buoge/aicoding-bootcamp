"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const GhostFibers = dynamic(() => import("@/components/GhostFibers"), { ssr: false });
export function HeroBackground() {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return (
    <>
      <div className="hero-fibers" aria-hidden="true">
        <GhostFibers
          glowColor="#58d59b"
          lineColor="#b4edbf"
          secondaryColor="#45b5a7"
          gradient="across"
          speed={0.32}
          rotation={-18}
          scale={1.05}
          rollSpeed={0.08}
          layers={3}
          waves={1.1}
          twist={0.8}
          threads={54}
          density={0.8}
          fiberStyle="dots"
          thickness={1.1}
          particles={0.45}
          glow={0.8}
          brightness={0.9}
          grain={0.025}
          vignette={0.2}
          dpr={1.25}
          mouseInteraction={!reduced}
          pulseOnClick={false}
          intro={!reduced}
          paused={paused || reduced}
        />
      </div>
      {!reduced && (
        <Button
          variant="ghost"
          size="icon"
          className="animation-toggle"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "播放背景动画" : "暂停背景动画"}
          aria-pressed={paused}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
      )}
    </>
  );
}
