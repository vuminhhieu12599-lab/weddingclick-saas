"use client";

import { useEffect, useRef, useState } from "react";

import { PROTOTYPE_WEDDING_DATA } from "./_data/wedding-data";
import { VietnameseHeritagePrototype } from "./_directions/vietnamese-heritage/vietnamese-heritage";
import { RomanticMinimalPrototype } from "./_directions/romantic-minimal/romantic-minimal";
// "Elegant Editorial" now renders the rebuilt moss-green/ivory editorial
// implementation (checkpoint V8 — this replaces the old elegant-editorial
// component; it is not a separate 4th direction). The prior implementation
// still lives at ./_directions/elegant-editorial, intentionally unimported,
// kept only for comparison/recovery until explicitly approved for removal.
import { GreenIvoryEditorialPrototype } from "./_directions/green-ivory-editorial/green-ivory-editorial";
import { DEFAULT_SECTION_VISIBILITY, SECTION_KEYS, SECTION_LABELS } from "./_shared/sections";
import type { SectionVisibility } from "./_shared/sections";
import type { InvitationVariant } from "./_shared/types";
import styles from "./prototype.module.css";

const DIRECTIONS = [
  { key: "elegant-editorial", label: "Elegant Editorial" },
  { key: "vietnamese-heritage", label: "Vietnamese Heritage" },
  { key: "romantic-minimal", label: "Romantic Minimal" },
] as const;

type DirectionKey = (typeof DIRECTIONS)[number]["key"];

const VIEWPORT_WIDTHS = [360, 390, 430] as const;

const VARIANTS: InvitationVariant[] = ["COMMON", "GROOM", "BRIDE"];

// Sample data only — stands in for a customer's own guest list (checkpoint
// V5 §B5: the bride/groom manage this themselves, an admin never types
// every guest name by hand).
const SAMPLE_GUEST_LIST = ["Anh Hiếu", "Chị Lan", "Gia đình Anh Tuấn", "Cô Hương"];

/**
 * Task 029 checkpoint — isolated visual-only prototype selector + reviewer
 * control panel. Static data only. No database/API access. Not part of
 * production navigation. Safe to delete or promote once frozen after PO
 * review. Kept outside the phone canvas so it never pollutes the
 * invitation design itself (checkpoint spec §16).
 */
export default function InvitationPrototypeReviewPage() {
  const [direction, setDirection] = useState<DirectionKey>("elegant-editorial");
  const [width, setWidth] = useState<(typeof VIEWPORT_WIDTHS)[number]>(390);
  const [variant, setVariant] = useState<InvitationVariant>("COMMON");
  const [personalization, setPersonalization] = useState(false);
  const [guestDisplayName, setGuestDisplayName] = useState("Anh Hiếu");
  const [guestList, setGuestList] = useState<string[]>(SAMPLE_GUEST_LIST);
  const [newGuestName, setNewGuestName] = useState("");
  const [sections, setSections] = useState<SectionVisibility>(DEFAULT_SECTION_VISIBILITY);
  const [replayKey, setReplayKey] = useState(0);
  const phoneScreenRef = useRef<HTMLDivElement>(null);

  // Switching template/variant/replay remounts the invitation below, but the
  // scrollable phone-screen container itself persists — without this it
  // keeps whatever scroll position the reviewer was at, so the new opening
  // can appear scrolled past instead of in the first viewport. Reset on
  // every switch so the opening is always what's shown first.
  useEffect(() => {
    phoneScreenRef.current?.scrollTo({ top: 0 });
  }, [direction, variant, replayKey]);

  const toggleSection = (key: keyof SectionVisibility) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addGuest = () => {
    const trimmed = newGuestName.trim();
    if (!trimmed) return;
    setGuestList((prev) => [...prev, trimmed]);
    setNewGuestName("");
  };

  const removeGuest = (name: string) => {
    setGuestList((prev) => prev.filter((g) => g !== name));
  };

  const previewGuest = (name: string) => {
    setGuestDisplayName(name);
    setPersonalization(true);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Task 029 — Invitation Prototype Review</h1>
        <p className={styles.subtitle}>
          Internal-only visual prototype. Static fictional data. Not connected to any
          database, API, or production route.
        </p>
      </header>

      <div className={styles.controls}>
        <div className={styles.group}>
          {DIRECTIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`${styles.groupButton} ${
                direction === d.key ? styles.groupButtonActive : ""
              }`}
              onClick={() => setDirection(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className={styles.group}>
          {VIEWPORT_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={`${styles.groupButton} ${width === w ? styles.groupButtonActive : ""}`}
              onClick={() => setWidth(w)}
            >
              {w}px
            </button>
          ))}
        </div>

        <div className={styles.group}>
          {VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              className={`${styles.groupButton} ${variant === v ? styles.groupButtonActive : ""}`}
              onClick={() => setVariant(v)}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.replayButton}
          onClick={() => setReplayKey((k) => k + 1)}
        >
          Replay opening
        </button>
      </div>

      <div className={styles.controlsRow}>
        <label className={styles.personalizationToggle}>
          <input
            type="checkbox"
            checked={personalization}
            onChange={(e) => setPersonalization(e.target.checked)}
          />
          Personalization {personalization ? "ON" : "OFF"}
        </label>
        <input
          type="text"
          className={styles.guestNameInput}
          value={guestDisplayName}
          onChange={(e) => setGuestDisplayName(e.target.value)}
          placeholder="Guest display name"
          disabled={!personalization}
        />
      </div>

      <div className={styles.guestListPanel}>
        <div className={styles.guestListHeading}>
          Danh sách khách mời <span className={styles.guestListHeadingNote}>(khách hàng tự quản lý — không phải admin nhập hộ)</span>
        </div>
        <p className={styles.guestListHelp}>
          Cô dâu/chú rể tự thêm từng khách bên dưới, hoặc tải lên một file Excel. Chọn một tên để xem thiệp
          được cá nhân hoá cho khách đó.
        </p>
        <div className={styles.guestListAddRow}>
          <input
            type="text"
            className={styles.guestNameInput}
            value={newGuestName}
            onChange={(e) => setNewGuestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGuest();
              }
            }}
            placeholder="Nhập tên khách mời…"
          />
          <button type="button" className={styles.guestListAddButton} onClick={addGuest}>
            + Thêm khách
          </button>
          <button
            type="button"
            className={styles.guestListExcelButton}
            disabled
            title="Khách hàng tự tải danh sách khách mời từ Excel — tính năng sắp ra mắt"
          >
            Tải từ Excel (sắp có)
          </button>
        </div>
        <div className={styles.guestListChips}>
          {guestList.map((name) => (
            <span
              key={name}
              className={`${styles.guestListChip} ${
                personalization && guestDisplayName === name ? styles.guestListChipActive : ""
              }`}
            >
              <button type="button" className={styles.guestListChipLabel} onClick={() => previewGuest(name)}>
                {name}
              </button>
              <button
                type="button"
                className={styles.guestListChipRemove}
                aria-label={`Xoá ${name}`}
                onClick={() => removeGuest(name)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <details className={styles.sectionsPanel} open>
        <summary className={styles.sectionsSummary}>Sections</summary>
        <div className={styles.sectionsGrid}>
          {SECTION_KEYS.map((key) => (
            <label key={key} className={styles.sectionToggle}>
              <input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} />
              {SECTION_LABELS[key]}
            </label>
          ))}
        </div>
      </details>

      <p className={styles.shareCoverNote}>
        📌 Concept (not built here): social share cover — <strong>{PROTOTYPE_WEDDING_DATA.shareCover.imageLabel}</strong>.{" "}
        {PROTOTYPE_WEDDING_DATA.shareCover.note}
      </p>

      <div className={styles.canvasArea}>
        <div className={styles.phoneFrame} style={{ ["--frame-width" as string]: `${width}px` }}>
          <div className={styles.phoneScreen} ref={phoneScreenRef}>
            <PrototypeSurface
              direction={direction}
              variant={variant}
              personalization={personalization}
              guestDisplayName={guestDisplayName}
              sections={sections}
              replayKey={replayKey}
            />
          </div>
        </div>
      </div>

      <p className={styles.note}>
        Prototype-only architecture preflight (Task 029 checkpoint). Content, palette,
        typography, and motion are illustrative directions for Product Owner review —
        not the frozen production renderer contract.
      </p>
    </div>
  );
}

function PrototypeSurface({
  direction,
  variant,
  personalization,
  guestDisplayName,
  sections,
  replayKey,
}: {
  direction: DirectionKey;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  sections: SectionVisibility;
  replayKey: number;
}) {
  const key = `${direction}-${variant}-${replayKey}`;
  const props = { data: PROTOTYPE_WEDDING_DATA, variant, personalization, guestDisplayName, sections };

  if (direction === "vietnamese-heritage") {
    return <VietnameseHeritagePrototype key={key} {...props} />;
  }
  if (direction === "romantic-minimal") {
    return <RomanticMinimalPrototype key={key} {...props} />;
  }
  return <GreenIvoryEditorialPrototype key={key} {...props} />;
}
