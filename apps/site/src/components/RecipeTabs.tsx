"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface RecipeTab {
  id: string;
  title: string;
  description: string;
  panel: ReactNode;
}

export function RecipeTabs({ tabs }: { tabs: RecipeTab[] }) {
  const [active, setActive] = useState(tabs[0]!.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0]!;

  const focusTab = (index: number) => {
    const wrapped = (index + tabs.length) % tabs.length;
    tabRefs.current[wrapped]?.focus();
    setActive(tabs[wrapped]!.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  };

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[240px_1fr]">
      <div
        role="tablist"
        aria-label="Recipes"
        aria-orientation="vertical"
        className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`focus-ring shrink-0 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap transition-colors lg:whitespace-normal ${
              tab.id === active
                ? "bg-ink text-canvas"
                : "text-ink-soft hover:bg-canvas-raised hover:text-ink"
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeTab.id}`}
        aria-labelledby={`tab-${activeTab.id}`}
        tabIndex={0}
        className="focus-ring min-w-0"
      >
        <p className="mb-4 text-sm leading-relaxed text-ink-soft">{activeTab.description}</p>
        {activeTab.panel}
      </div>
    </div>
  );
}
