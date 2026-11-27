"use client";

import { useState } from "react";

import { showroomFilterCategories, type ShowroomTemplateEntry } from "../../lib/showroom/showroom-catalog";
import styles from "./showroom.module.css";
import { TemplateCard } from "./template-card";

const ALL = "";
/** Covers loaded eagerly: the first two rows of the phone grid. */
const PRIORITY_CARDS = 4;

/**
 * The filterable 2-up grid. Chips come from the catalog categories that are
 * present; "Tất cả" is the default, so the server-rendered HTML lists every
 * template and works without JavaScript.
 */
export function TemplateGrid({ templates }: { readonly templates: readonly ShowroomTemplateEntry[] }) {
  const [active, setActive] = useState(ALL);
  const chips = showroomFilterCategories(templates);
  // New templates lead the grid; otherwise catalog order (Array.sort is stable).
  const ordered = [...templates].sort((a, b) => Number(b.isNew === true) - Number(a.isNew === true));
  const visible = active === ALL ? ordered : ordered.filter((template) => template.categories.includes(active));
  return (
    <>
      {chips.length > 1 ? (
        <div className={styles.filterBar} role="group" aria-label="Lọc theo phong cách">
          <div className={styles.filterScroll}>
            {[{ key: ALL, label: "Tất cả" }, ...chips].map((chip) => (
              <button
                key={chip.key || "all"}
                type="button"
                className={styles.filterChip}
                aria-pressed={active === chip.key}
                onClick={() => setActive(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ol className={styles.templateGrid} aria-live="polite">
        {visible.map((template, index) => (
          <li key={template.templateCode}>
            <TemplateCard template={template} priority={index < PRIORITY_CARDS} />
          </li>
        ))}
      </ol>
    </>
  );
}
