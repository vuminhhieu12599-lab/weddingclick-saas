import { deriveEventDateTimePresentationV1 } from "../../../../lib/invitation-rendering/event-date-time-presentation";
import type { MediaResolution, ResolvedMedia } from "../../../../lib/invitation-rendering/invitation-view-model-types";
import { startMusicOnOpen } from "../../../../lib/invitation-rendering/music-control-model";
import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import { KHAN_VOAN_V1_COPY } from "./copy";
import { KHAN_VOAN_V1_FONT_VARIABLES_CLASS_NAME } from "./fonts";
import { Countdown } from "./interactive/countdown";
import { Gift } from "./interactive/gift";
import { MusicControl } from "./interactive/music-control";
import { OpeningStage } from "./interactive/opening-stage";
import { Rsvp } from "./interactive/rsvp";
import { SectionReveal } from "./interactive/section-reveal";
import styles from "./khan-voan-v1.module.css";
import { Album } from "./sections/album";
import { Ceremony } from "./sections/ceremony";
import { Cover, Seal } from "./sections/cover";
import { Families } from "./sections/families";
import { Invite } from "./sections/invite";
import { singleResolved } from "./sections/media-image";
import { Story } from "./sections/story";
import { Thanks } from "./sections/thanks";

function resolvedOnly(items: readonly MediaResolution[] | undefined): ResolvedMedia[] {
  return (items ?? []).flatMap((item) => (item.status === "RESOLVED" ? [item] : []));
}

/**
 * Khăn Voan v1 (`wedding.khan-voan.v1`) — the veil-lift invitation on ivory satin.
 *
 * Reads only the RF-05 props: `viewModel` (canonical data with runtime media
 * URLs), `sections` (the only visibility authority for optional sections)
 * and `capabilities` (presence gates). Variant rules (who comes first, Lễ
 * Thành Hôn / Vu Quy, which reception cards and gift sides) all arrive
 * resolved in the view model; this template never decides them.
 *
 * Media come only from `viewModel.media.templateSlots` (`coverPhoto`,
 * `groomPortrait`, `bridePortrait`, `storyPhotos`, `gallery`, `thankYouPhoto`)
 * plus `media.qr`. A missing or unavailable slot simply leaves its place out.
 */
export function KhanVoanV1({ viewModel, sections, capabilities }: InvitationRendererPropsV1) {
  const { people, families, ceremony, content, gift, media, operationalSides } = viewModel;
  const ceremonyDate = deriveEventDateTimePresentationV1(ceremony);
  const slots = media.templateSlots;
  const coverPhoto = singleResolved(slots?.coverPhoto);
  const portraits = { GROOM: singleResolved(slots?.groomPortrait), BRIDE: singleResolved(slots?.bridePortrait) } as const;
  const storyPhotos = resolvedOnly(slots?.storyPhotos);
  const gallery = slots?.gallery ?? [];
  const thankYouPhoto = singleResolved(slots?.thankYouPhoto);

  const music = sections.music ? capabilities.music : undefined;
  const loveStory = sections.loveStory ? content.loveStory : null;
  const invitationMessage = sections.invitationMessage ? content.invitationMessage : null;
  const guestDisplayName = viewModel.guest?.displayName;

  return (
    <div className={`${KHAN_VOAN_V1_FONT_VARIABLES_CLASS_NAME} ${styles.root}`} data-renderer="khan-voan-v1" data-variant={viewModel.variant}>
      <OpeningStage
        cover={<Cover people={people} ceremonyDate={ceremonyDate} photo={coverPhoto} />}
        seal={<Seal people={people} ceremonyDate={ceremonyDate} guestDisplayName={guestDisplayName} />}
        music={music === undefined ? null : <MusicControl music={music} />}
        {...(music === undefined ? {} : { onOpen: startMusicOnOpen(music) })}
      >
        <div className={styles.paper}>
          <span className={styles.sheen} aria-hidden="true" />
          <Invite guestDisplayName={guestDisplayName} message={invitationMessage} />
          <Families people={people} families={families} portraits={portraits} />
          <Story photos={storyPhotos} loveStory={loveStory} />
          <Ceremony
            ceremony={ceremony}
            ceremonyDate={ceremonyDate}
            cards={viewModel.ceremonyCards}
            countdown={capabilities.clock === undefined ? null : <Countdown ceremony={ceremony} clock={capabilities.clock} />}
          />
          {sections.gallery && gallery.length > 0 ? <Album gallery={gallery} /> : null}
          {capabilities.rsvp === undefined ? null : <Rsvp rsvp={capabilities.rsvp} />}
          {sections.gift ? (
            <section className={`${styles.section} ${styles.giftSection}`} aria-label={KHAN_VOAN_V1_COPY.gift.heading}>
              <Gift operationalSides={operationalSides} gift={gift} qr={media.qr} clipboard={capabilities.clipboard} download={capabilities.download} />
            </section>
          ) : null}
          <Thanks people={people} photo={thankYouPhoto} />
          <SectionReveal hasCountdown={capabilities.clock !== undefined} />
        </div>
      </OpeningStage>
    </div>
  );
}
