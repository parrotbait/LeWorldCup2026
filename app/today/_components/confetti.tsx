"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 80;
const COLORS = ["#4ade80", "#facc15", "#f87171", "#60a5fa", "#a78bfa", "#fb923c"];

export function Confetti({ matchId }: { matchId: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const firedRef = useRef(false);

    useEffect(() => {
        if (firedRef.current) {
            return;
        }
        firedRef.current = true;

        const container = containerRef.current;
        if (!container) {
            return;
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const particle = document.createElement("span");
            const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
            const x = (Math.random() - 0.5) * 350;
            const y = -(Math.random() * 180 + 60);
            const rot = Math.random() * 720 - 360;
            const delay = Math.random() * 400;
            const size = Math.random() * 6 + 3;

            particle.style.cssText = `
                position: absolute;
                left: 50%;
                top: 50%;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: ${Math.random() > 0.5 ? "50%" : "1px"};
                pointer-events: none;
                animation: confetti-burst 5000ms ${delay}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
                --x: ${x}px;
                --y: ${y}px;
                --rot: ${rot}deg;
                opacity: 0;
            `;
            container.appendChild(particle);
        }

        const timer = setTimeout(() => {
            if (container) {
                container.innerHTML = "";
            }
        }, 5800);

        return () => {
            clearTimeout(timer);
        };
    }, [matchId]);

    return (
        <>
            <style>{`
                @keyframes confetti-burst {
                    0% {
                        transform: translate(-50%, -50%) scale(0);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(var(--rot)) scale(1);
                        opacity: 0;
                    }
                }
            `}</style>
            <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10 overflow-visible" />
        </>
    );
}
