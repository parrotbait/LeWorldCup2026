"use client";

import { useState } from "react";

export interface BonusTooltipEntry {
    label: string;
    pick: string;
    points: number;
}

export function BonusTooltipRow({
    children,
    entries,
    className,
}: {
    children: React.ReactNode;
    entries: BonusTooltipEntry[];
    className?: string;
}) {
    const [show, setShow] = useState(false);
    const total = entries.reduce((acc, e) => acc + e.points, 0);

    return (
        <tr
            className={`group ${className ?? ""}`}
            onMouseEnter={() => {
                setShow(true);
            }}
            onMouseLeave={() => {
                setShow(false);
            }}
        >
            {children}
            {show && entries.length > 0 ? (
                <td className="relative p-0 w-0">
                    <div className="absolute right-0 top-0 z-50 hidden lg:block">
                        <div className="w-64 rounded border border-ink/20 bg-paper p-3 shadow-lg">
                            <p className="font-display text-[10px] uppercase tracking-widest opacity-60">
                                Bonus breakdown
                            </p>
                            <table className="mt-2 w-full text-xs">
                                <tbody>
                                    {entries.map((e) => (
                                        <tr key={e.label}>
                                            <td className="py-0.5 pr-2 opacity-70">
                                                {e.label}
                                            </td>
                                            <td className="py-0.5 pr-2 truncate max-w-[100px]">
                                                {e.pick}
                                            </td>
                                            <td className="py-0.5 text-right font-display">
                                                {e.points > 0 ? (
                                                    <span className="text-emerald-700">
                                                        {e.points}
                                                    </span>
                                                ) : (
                                                    <span className="opacity-30">0</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="border-t border-ink/20">
                                    <tr>
                                        <td
                                            colSpan={2}
                                            className="pt-1 font-display text-[10px] uppercase"
                                        >
                                            Total
                                        </td>
                                        <td className="pt-1 text-right font-display font-bold">
                                            {total}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </td>
            ) : null}
        </tr>
    );
}
