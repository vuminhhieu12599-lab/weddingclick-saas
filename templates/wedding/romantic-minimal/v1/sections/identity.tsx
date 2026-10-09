import type { InvitationViewModel, ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { DecorImage } from "./decor";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function FamilyColumn({ family }: { family: ViewModelFamily }) {
  return (
    <div className={styles.identityFamily} data-side={family.side}>
      <h3 className={styles.familyLabel}>{COPY.identity.labelBySide[family.side]}</h3>
      {present(family.father) ? <p className={styles.familyParent}>{family.father}</p> : null}
      {present(family.mother) ? <p className={styles.familyParent}>{family.mother}</p> : null}
      {present(family.address) ? <p className={styles.familyLocation}>{family.address}</p> : null}
    </div>
  );
}

/** Hairline — tiny heart — hairline connector from Save The Date (Task 029 inline SVG). */
function Connector() {
  return (
    <svg viewBox="0 0 220 20" width="220" height="20" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rm-connector-left" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="90" y2="0">
          <stop offset="0" stopColor="#c5a06a" stopOpacity="0" />
          <stop offset="1" stopColor="#c5a06a" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="rm-connector-right" gradientUnits="userSpaceOnUse" x1="216" y1="0" x2="130" y2="0">
          <stop offset="0" stopColor="#c5a06a" stopOpacity="0" />
          <stop offset="1" stopColor="#c5a06a" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <line x1="4" y1="10" x2="90" y2="10" stroke="url(#rm-connector-left)" strokeWidth="1" />
      <line x1="130" y1="10" x2="216" y2="10" stroke="url(#rm-connector-right)" strokeWidth="1" />
      <circle cx="95" cy="10" r="1.4" fill="#c5a06a" opacity="0.8" />
      <circle cx="125" cy="10" r="1.4" fill="#c5a06a" opacity="0.8" />
      <path
        d="M110 16.2 C104.6 12.4 102.4 10 102.4 7.3 C102.4 5.1 104.1 3.5 106.1 3.5 C107.8 3.5 109.2 4.5 110 6 C110.8 4.5 112.2 3.5 113.9 3.5 C115.9 3.5 117.6 5.1 117.6 7.3 C117.6 10 115.4 12.4 110 16.2 Z"
        fill="rgba(243, 221, 225, 0.6)"
        stroke="#c88491"
        strokeWidth="1"
      />
    </svg>
  );
}

interface IdentityProps {
  people: InvitationViewModel["people"];
  families: InvitationViewModel["families"];
  ceremonyTitle: InvitationViewModel["ceremony"]["title"];
}

/**
 * Task 029 couple + family identity: connector, the vertical rite accent
 * (`ceremony.title` verbatim, one word per line: GROOM "Lễ Thành Hôn",
 * BRIDE "Lễ Vu Quy"), the couple in resolver order, the divider, then the
 * two family columns `families.primary` then `.secondary` with labels from
 * the explicit `side`. Null/blank lines are omitted; the family address is
 * the canonical location line.
 */
export function Identity({ people, families, ceremonyTitle }: IdentityProps) {
  return (
    <section className={styles.identity} aria-labelledby="rm-identity-heading">
      <h2 id="rm-identity-heading" className={styles.srOnly}>
        {COPY.identity.heading}
      </h2>
      <DecorImage decor="floralTopLeft" className={`${styles.identityWatermark} ${styles.identityWatermarkTop}`} />
      <DecorImage decor="floralBottomRight" className={`${styles.identityWatermark} ${styles.identityWatermarkBottom}`} />

      <div className={styles.identityConnector}>
        <Connector />
      </div>

      <div className={styles.identityTop}>
        <div className={styles.identityAccent}>
          <span className={styles.identityAccentLine} aria-hidden="true" />
          <span className={styles.identityAccentText}>
            {ceremonyTitle.split(" ").map((word, index) => (
              <span key={`${word}-${String(index)}`}>{word}</span>
            ))}
          </span>
          <span className={styles.identityAccentLine} aria-hidden="true" />
        </div>
        <div className={styles.identityNamesWrap}>
          <p className={styles.identityNames}>
            <span>{people.primary.name}</span>
            <span className={styles.identityAmpersand} aria-hidden="true">
              &amp;
            </span>
            <span className={styles.srOnly}>{COPY.a11y.and}</span>
            <span>{people.secondary.name}</span>
          </p>
        </div>
      </div>

      <div className={styles.identityDividerWrap}>
        <DecorImage decor="divider" className={styles.identityDivider} />
      </div>

      <div className={styles.identityFamilies}>
        <FamilyColumn family={families.primary} />
        <FamilyColumn family={families.secondary} />
      </div>
    </section>
  );
}
