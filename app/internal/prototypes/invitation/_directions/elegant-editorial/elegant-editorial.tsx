"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { deriveCeremonyDisplay } from "../../_shared/derive-ceremony";
import { useCountdown } from "../../_shared/use-countdown";
import { useReducedMotion } from "../../_shared/use-reduced-motion";
import { useClipboard } from "../../_shared/use-clipboard";
import { useRsvpForm } from "../../_shared/use-rsvp-form";
import { useMusicControl } from "../../_shared/use-music-control";
import { resolveInvitation } from "../../_shared/resolve-variant";
import { buildInvitationMessage } from "../../_shared/invitation-text";
import { RSVP_OPTIONS } from "../../_shared/rsvp-options";
import { Reveal } from "../../_shared/reveal";
import type { InvitationVariant, PrototypeWeddingData, SideDetails } from "../../_shared/types";
import type { SectionVisibility } from "../../_shared/sections";
import styles from "./elegant-editorial.module.css";

// One tall portrait lead tile, then editorial rhythm — never a rigid grid.
const GALLERY_LAYOUT: Array<{ col: number; row: number }> = [
  { col: 2, row: 6 },
  { col: 2, row: 3 },
  { col: 1, row: 3 },
  { col: 1, row: 3 },
  { col: 2, row: 3 },
  { col: 1, row: 4 },
  { col: 1, row: 2 },
  { col: 2, row: 3 },
  { col: 1, row: 3 },
  { col: 1, row: 3 },
  { col: 2, row: 2 },
  { col: 1, row: 3 },
];

const TONE_COUNT = 4;

interface Props {
  data: PrototypeWeddingData;
  variant: InvitationVariant;
  personalization: boolean;
  guestDisplayName: string;
  sections: SectionVisibility;
}

export function ElegantEditorialPrototype({ data, variant, personalization, guestDisplayName, sections }: Props) {
  const [opened, setOpened] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const rsvpForm = useRsvpForm(guestDisplayName);
  const music = useMusicControl();

  const resolved = resolveInvitation(data, variant);
  const ceremony = deriveCeremonyDisplay(data.ceremonyDateTimeIso, data.timeZone);
  const countdown = useCountdown(data.ceremonyDateTimeIso);
  const message = buildInvitationMessage(
    data.invitationWording.template,
    resolved.ceremonyTitle,
    personalization,
    guestDisplayName
  );
  const multiSide = resolved.operationalSides.length > 1;

  const coverExitTransition = { duration: reducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] as const };

  const toneClass = (index: number) => styles[`tone${index % TONE_COUNT}`];

  const showLogistics =
    sections.ceremony || sections.receptionTime || sections.venue || sections.directions || sections.countdown;

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={`${styles.musicButton} ${music.isPlaying ? styles.musicButtonActive : ""}`}
        onClick={music.toggle}
        aria-pressed={music.isPlaying}
        aria-label={music.isPlaying ? "Tắt nhạc nền" : "Bật nhạc nền"}
        title={data.music.trackLabel}
      >
        <span className={styles.musicIcon} aria-hidden="true">
          {music.isPlaying ? "♫" : "♪"}
        </span>
      </button>

      {/* Opening — full-bleed editorial photograph, text card floating over  */}
      {/* its lower third (text-over-image), never a flat colored panel.     */}
      <AnimatePresence>
        {!opened && (
          <motion.div className={styles.cover} exit={{ opacity: 0 }} transition={coverExitTransition}>
            <div className={styles.coverPhoto} />
            <div className={styles.coverPhotoScrim} />
            <div className={styles.coverGrain} />
            <div className={styles.coverFrameMark} />

            <motion.div
              className={styles.coverCard}
              initial={reducedMotion ? false : "hidden"}
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
              }}
            >
              <motion.span
                className={styles.coverEyebrow}
                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              >
                N°01 · Đà Nẵng, {ceremony.yearLabel}
              </motion.span>
              <motion.div
                className={styles.coverNames}
                variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
              >
                {resolved.primary.personName}
                <span className={styles.coverAmp}>&amp;</span>
                {resolved.secondary.personName}
              </motion.div>
              <motion.span
                className={styles.coverKicker}
                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              >
                {ceremony.fullDateLabel} · {resolved.ceremonyTitle}
              </motion.span>
              <motion.button
                type="button"
                className={styles.openButtonRow}
                onClick={() => setOpened(true)}
                variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
              >
                <span className={styles.openButtonRule} />
                <span className={styles.openButtonLabel}>Mở Thiệp Mời</span>
                <span className={styles.openButtonRule} />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: opened ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.35 }}
      >
        {/* Hero — asymmetric layered pair: a dominant portrait with a       */}
        {/* smaller accent photo tucked behind, plate overlapping both.     */}
        <div className={styles.heroZone}>
          <div className={styles.heroAccentPhoto} />
          <div className={styles.heroPhoto} />
          <div className={styles.heroPlate}>
            <div className={styles.heroKicker}>{ceremony.fullDateLabel}</div>
            <div className={styles.heroNames}>
              {resolved.primary.personName}
              <br />
              &amp; {resolved.secondary.personName}
            </div>
          </div>
        </div>

        {sections.mainText && (
          <section className={styles.sectionMessage}>
            <Reveal>
              <p className={styles.message}>{message}</p>
            </Reveal>
          </section>
        )}

        {/* Family — ceremonial two-column presentation, ordered by variant. */}
        {sections.family && (
          <section className={styles.sectionFamily}>
            <Reveal>
              <div className={styles.familyOrnament}>
                <span className={styles.familyOrnamentRule} />
                <span className={styles.familyOrnamentMark}>&#10022;</span>
                <span className={styles.familyOrnamentRule} />
              </div>
            </Reveal>
            <div className={styles.familyColumns}>
              <Reveal delay={0.05}>
                <FamilyColumn side={resolved.primary} />
              </Reveal>
              <span className={styles.familyDivider} />
              <Reveal delay={0.12}>
                <FamilyColumn side={resolved.secondary} />
              </Reveal>
            </div>
          </section>
        )}

        {/* Duo image — two symmetrical editorial frames, a distinct rhythm  */}
        {/* beat from the hero pair and the three-photo cluster below.      */}
        {sections.threePhoto && (
          <section className={styles.sectionDuo}>
            <Reveal y={0}>
              <div className={styles.duoRow}>
                <div className={`${styles.duoPhoto} ${toneClass(1)}`} />
                <div className={`${styles.duoPhoto} ${toneClass(2)}`} />
              </div>
            </Reveal>
          </section>
        )}

        {showLogistics && (
          <section className={styles.sectionCeremony}>
            <Reveal>
              <div className={styles.ceremonyCard}>
                {sections.ceremony && (
                  <>
                    <h2 className={styles.ceremonyTitle}>{resolved.ceremonyTitle}</h2>
                    <div className={styles.ceremonyDate}>
                      {ceremony.weekdayLabel.toUpperCase()}, {ceremony.fullDateLabel} — {ceremony.timeLabel}
                    </div>
                  </>
                )}

                {sections.receptionTime && (
                  <div className={styles.logisticsBlock}>
                    <div className={styles.logisticsLabel}>Giờ tiệc</div>
                    {resolved.operationalSides.map((side) => {
                      const receptionDisplay = deriveCeremonyDisplay(side.receptionDateTimeIso, data.timeZone);
                      return (
                        <div key={side.sideLabel} className={styles.logisticsRow}>
                          {multiSide && <span className={styles.logisticsSide}>{side.sideLabel}</span>}
                          {receptionDisplay.weekdayLabel}, {receptionDisplay.timeLabel} ·{" "}
                          {receptionDisplay.fullDateLabel}
                        </div>
                      );
                    })}
                  </div>
                )}

                {sections.venue && (
                  <div className={styles.logisticsBlock}>
                    <div className={styles.logisticsLabel}>Địa điểm</div>
                    {resolved.operationalSides.map((side) => (
                      <div key={side.sideLabel} className={styles.ceremonyVenue}>
                        {multiSide && <span className={styles.logisticsSide}>{side.sideLabel}</span>}
                        {side.venueName}
                        <br />
                        {side.venueAddress}
                      </div>
                    ))}
                  </div>
                )}

                {sections.directions && (
                  <div className={styles.directionsRow}>
                    {resolved.operationalSides.map((side) => (
                      <a
                        key={side.sideLabel}
                        className={styles.directionsButton}
                        href={side.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {multiSide ? `Chỉ đường · ${side.sideLabel}` : "Xem chỉ đường"}
                      </a>
                    ))}
                  </div>
                )}

                {sections.countdown && !countdown.hasPassed && (
                  <div className={styles.countdownRow}>
                    <div className={styles.countdownCell}>
                      <span className={styles.countdownValue}>{countdown.days}</span>
                      <span className={styles.countdownLabel}>Ngày</span>
                    </div>
                    <div className={styles.countdownCell}>
                      <span className={styles.countdownValue}>{countdown.hours}</span>
                      <span className={styles.countdownLabel}>Giờ</span>
                    </div>
                    <div className={styles.countdownCell}>
                      <span className={styles.countdownValue}>{countdown.minutes}</span>
                      <span className={styles.countdownLabel}>Phút</span>
                    </div>
                    <div className={styles.countdownCell}>
                      <span className={styles.countdownValue}>{countdown.seconds}</span>
                      <span className={styles.countdownLabel}>Giây</span>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
          </section>
        )}

        {sections.timeline && (
          <section className={styles.sectionTimeline}>
            <Reveal>
              <div className={styles.spreadKicker}>Chương trình</div>
              <div className={styles.timelineList}>
                {data.timeline.map((item) => {
                  const display = deriveCeremonyDisplay(item.dateTimeIso, data.timeZone);
                  return (
                    <div key={item.label} className={styles.timelineItem}>
                      <span className={styles.timelineTime}>{display.timeLabel}</span>
                      <span className={styles.timelineDot} />
                      <span className={styles.timelineItemLabel}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </section>
        )}

        {sections.threePhoto && (
          <section className={styles.sectionSpread}>
            <Reveal y={0}>
              <div className={styles.spreadKicker}>Khoảnh khắc</div>
              <div className={styles.spreadGrid}>
                <div className={`${styles.spreadMain} ${toneClass(0)}`} />
                <div className={`${styles.spreadSecondaryA} ${toneClass(3)}`} />
                <div className={`${styles.spreadSecondaryB} ${toneClass(1)}`} />
                <span className={styles.spreadCaption}>{ceremony.fullDateLabel}</span>
              </div>
            </Reveal>
          </section>
        )}

        {/* Love story — full-bleed photo with a floating quote card, the   */}
        {/* clearest text-over-image moment on the page. */}
        {sections.loveStory && (
          <section className={styles.sectionStory}>
            <div className={`${styles.storyPhoto} ${toneClass(2)}`} />
            <div className={styles.storyScrim} />
            <Reveal className={styles.storyCardWrap}>
              <div className={styles.storyCard}>
                <span className={styles.storyQuoteMark}>&ldquo;</span>
                <p className={styles.storyQuote}>{data.loveStory}</p>
              </div>
            </Reveal>
          </section>
        )}

        {(sections.rsvp || sections.gift) && (
          <section className={styles.sectionDetails}>
            {sections.rsvp && (
              <Reveal>
                <div className={styles.rsvpCard}>
                  <h3 className={styles.rsvpHeading}>Xác nhận tham dự</h3>
                  <span className={styles.rsvpHeadingRule} />

                  {rsvpForm.submission ? (
                    <div className={styles.rsvpConfirm}>
                      <p className={styles.rsvpFeedback}>
                        Cảm ơn {rsvpForm.submission.guestName} đã phản hồi
                        {rsvpForm.submission.choice === "attending" ? " — rất mong được đón tiếp!" : "!"}
                      </p>
                      {rsvpForm.submission.message && (
                        <p className={styles.rsvpMessageRecap}>&ldquo;{rsvpForm.submission.message}&rdquo;</p>
                      )}
                      <button type="button" className={styles.rsvpEditButton} onClick={rsvpForm.editAgain}>
                        Sửa lại
                      </button>
                    </div>
                  ) : (
                    <form className={styles.rsvpForm} onSubmit={rsvpForm.submit}>
                      <input
                        type="text"
                        className={styles.rsvpNameInput}
                        value={rsvpForm.guestName}
                        onChange={(e) => rsvpForm.setGuestName(e.target.value)}
                        placeholder="Tên của bạn"
                        required
                      />
                      <div className={styles.rsvpButtons}>
                        {RSVP_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`${styles.rsvpButton} ${
                              rsvpForm.choice === option.id ? styles.rsvpButtonActive : ""
                            }`}
                            onClick={() => rsvpForm.setChoice(option.id)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className={styles.rsvpMessageInput}
                        value={rsvpForm.message}
                        onChange={(e) => rsvpForm.setMessage(e.target.value)}
                        placeholder="Gửi lời chúc đến cô dâu & chú rể…"
                        rows={3}
                      />
                      <button type="submit" className={styles.rsvpSubmitButton} disabled={!rsvpForm.canSubmit}>
                        Gửi phản hồi
                      </button>
                    </form>
                  )}
                </div>
              </Reveal>
            )}

            {sections.gift && (
              <Reveal delay={0.08} className={styles.giftBlock}>
                <p className={styles.giftNote}>{data.giftIntroNote}</p>
                <button type="button" className={styles.giftButton} onClick={() => setGiftOpen(true)}>
                  Gửi quà cưới
                </button>
              </Reveal>
            )}
          </section>
        )}

        {sections.dressCode && (
          <section className={styles.sectionDressCode}>
            <Reveal>
              <div className={styles.spreadKicker}>Dress code</div>
              <p className={styles.dressCodeText}>{data.dressCode.description}</p>
              <div className={styles.dressCodeSwatches}>
                {data.dressCode.palette.map((color) => (
                  <span key={color} className={styles.dressCodeSwatch} style={{ background: color }} />
                ))}
              </div>
            </Reveal>
          </section>
        )}

        {sections.gallery && (
          <section className={styles.sectionGallery}>
            <Reveal>
              <div className={styles.galleryKicker}>Album ảnh cưới</div>
            </Reveal>
            <div className={styles.galleryGrid}>
              {GALLERY_LAYOUT.map((item, index) => (
                <div
                  key={index}
                  className={`${styles.galleryItem} ${toneClass(index)}`}
                  style={{ gridColumn: `span ${item.col}`, gridRow: `span ${item.row}` }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Closing — full-bleed photo bookend matching the opening, text   */}
        {/* over image again so the page opens and closes on the same beat. */}
        {sections.closing && (
          <section className={styles.sectionClosing}>
            <div className={styles.closingPhoto} />
            <div className={styles.closingScrim} />
            <Reveal y={0} className={styles.closingCardWrap}>
              <div className={styles.closingFrame}>
                <p className={styles.closingLine}>{data.closingMessage}</p>
                <div className={styles.closingNames}>
                  {resolved.primary.personName} &amp; {resolved.secondary.personName}
                </div>
              </div>
            </Reveal>
          </section>
        )}

        <footer className={styles.footer}>{ceremony.fullDateLabel} · Đà Nẵng</footer>
      </motion.div>

      {sections.gift && giftOpen && (
        <GiftModal sides={resolved.operationalSides} multiSide={multiSide} onClose={() => setGiftOpen(false)} />
      )}
    </div>
  );
}

function FamilyColumn({ side }: { side: SideDetails }) {
  return (
    <div className={styles.familyColumn}>
      <div className={styles.familySideLabel}>{side.sideLabel}</div>
      <div className={styles.familyParentRow}>{side.fatherName}</div>
      <div className={styles.familyParentRow}>{side.motherName}</div>
      <div className={styles.familyAddress}>{side.familyAddress}</div>
    </div>
  );
}

function GiftModal({
  sides,
  multiSide,
  onClose,
}: {
  sides: SideDetails[];
  multiSide: boolean;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { copiedKey, copy } = useClipboard();
  const side = sides[activeIndex] ?? sides[0];

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Gửi quà cưới">
      <button type="button" className={styles.modalScrim} aria-label="Đóng" onClick={onClose} />
      <div className={styles.modalPanel}>
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Đóng">
          ✕
        </button>

        {multiSide && (
          <div className={styles.modalTabs}>
            {sides.map((s, index) => (
              <button
                key={s.sideLabel}
                type="button"
                className={`${styles.modalTab} ${index === activeIndex ? styles.modalTabActive : ""}`}
                onClick={() => setActiveIndex(index)}
              >
                {s.sideLabel}
              </button>
            ))}
          </div>
        )}

        <div className={styles.modalQr} aria-hidden="true" />

        <div className={styles.modalRow}>
          <span className={styles.modalRowLabel}>Ngân hàng</span>
          <span className={styles.modalRowValue}>{side.gift.bankName}</span>
        </div>
        <div className={styles.modalRow}>
          <span className={styles.modalRowLabel}>Chủ tài khoản</span>
          <span className={styles.modalRowValue}>{side.gift.accountHolder}</span>
        </div>
        <div className={styles.modalRow}>
          <span className={styles.modalRowLabel}>Số tài khoản</span>
          <span className={styles.modalRowValue}>{side.gift.accountNumber}</span>
          <button
            type="button"
            className={styles.modalCopyButton}
            onClick={() => copy(side.sideLabel, side.gift.accountNumber)}
          >
            {copiedKey === side.sideLabel ? "Đã sao chép" : "Sao chép"}
          </button>
        </div>
      </div>
    </div>
  );
}
