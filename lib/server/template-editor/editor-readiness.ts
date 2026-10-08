import type { InvitationVariant } from "../../domain";
import { resolveWeddingDomain } from "../../invitation-rendering/resolve-wedding-domain";
import type { CoupleSide } from "../../invitation-rendering/wedding-domain-types";
import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import type { ProjectEventRecord } from "../project-events/project-events-types";
import type { WeddingDetailsRecord } from "../wedding-details/wedding-details-types";

/**
 * TE-05A — template-aware Staff readiness (docs/DECISIONS.md "TE-05A").
 * Pure and deterministic. Staff guidance only: it never changes Review
 * validation, Snapshot rules or the lifecycle, and it never makes a
 * recommended item or a media slot a blocker.
 */
export type EditorReadinessItemStatus = "COMPLETE" | "BLOCKING" | "WARNING" | "NOT_USED";
export type EditorReadinessOverall = "BLOCKING" | "WARNING" | "READY";
export type EditorReadinessItemKind = "TEMPLATE" | "CONTENT" | "MEDIA_SLOT";

export interface EditorReadinessItem {
  readonly key: string;
  readonly kind: EditorReadinessItemKind;
  readonly label: string;
  readonly status: EditorReadinessItemStatus;
  readonly message: string;
}

export interface EditorReadiness {
  readonly overall: EditorReadinessOverall;
  readonly items: readonly EditorReadinessItem[];
  readonly nextAction: string;
}

/** Trusted, server-loaded inputs. */
export type EditorReadinessInput =
  | { readonly template: "NOT_SELECTED" }
  | { readonly template: "UNSUPPORTED" }
  | {
      readonly template: "SELECTED";
      readonly manifest: TemplateEditorManifestV1;
      /** From the package policy; `null` = unknown package (fails the EVENTS item). */
      readonly requiredVariants: readonly InvitationVariant[] | null;
      readonly weddingDetails: WeddingDetailsRecord | null;
      readonly events: readonly ProjectEventRecord[];
      readonly timelineItemCount: number;
      readonly dressCode: { readonly description: string | null; readonly swatchCount: number } | null;
      readonly hasAudio: boolean;
      /** TEMPLATE_SLOTS only: assigned count per declared slot, or `"INVALID"` when the draft rows cannot be frozen. */
      readonly slotCounts: Readonly<Record<string, number>> | "INVALID" | null;
    };

export const TEMPLATE_MEDIA_INVALID_MESSAGE = "Cấu hình ảnh của mẫu không hợp lệ. Hãy tải lại hoặc cấu hình lại ảnh.";
const READY_NEXT_ACTION = "Sẵn sàng xem trước";

/** The Snapshot builder's rule: non-null and non-blank after trim. */
function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function item(key: string, kind: EditorReadinessItemKind, label: string, status: EditorReadinessItemStatus, message: string): EditorReadinessItem {
  return { key, kind, label, status, message };
}

function overallOf(items: readonly EditorReadinessItem[]): EditorReadinessOverall {
  if (items.some((entry) => entry.status === "BLOCKING")) return "BLOCKING";
  if (items.some((entry) => entry.status === "WARNING")) return "WARNING";
  return "READY";
}

function giftSideMeaningful(details: WeddingDetailsRecord, side: CoupleSide): boolean {
  return side === "GROOM"
    ? hasText(details.groomBankName) || hasText(details.groomBankAccountName) || hasText(details.groomBankAccountNumber) || details.groomBankQrMediaId !== null
    : hasText(details.brideBankName) || hasText(details.brideBankAccountName) || hasText(details.brideBankAccountNumber) || details.brideBankQrMediaId !== null;
}

interface ContentEvaluation {
  status: EditorReadinessItemStatus;
  message: string;
  nextAction?: string;
}

const NOT_USED: ContentEvaluation = { status: "NOT_USED", message: "Không sử dụng" };

export function evaluateEditorReadiness(input: EditorReadinessInput): EditorReadiness {
  if (input.template === "NOT_SELECTED") {
    const items = [item("TEMPLATE", "TEMPLATE", "Mẫu thiệp", "BLOCKING", "Chưa chọn mẫu thiệp")];
    return { overall: "BLOCKING", items, nextAction: "Chọn mẫu thiệp" };
  }
  if (input.template === "UNSUPPORTED") {
    const items = [item("TEMPLATE", "TEMPLATE", "Mẫu thiệp", "BLOCKING", "Mẫu thiệp đang chọn không hỗ trợ trình soạn nội dung")];
    return { overall: "BLOCKING", items, nextAction: "Chọn mẫu thiệp khác" };
  }

  const { manifest, weddingDetails: details } = input;
  // Ceremony validity and operational sides come from the canonical resolver, per required variant.
  const resolutions =
    details === null || input.requiredVariants === null
      ? null
      : input.requiredVariants.map((variant) => resolveWeddingDomain({ variant, weddingDetails: details, events: input.events }));
  const operationalSides = new Set<CoupleSide>(resolutions === null ? ["GROOM", "BRIDE"] : resolutions.flatMap((resolution) => resolution.operationalSides));

  const evaluateContent = (key: string): ContentEvaluation => {
    switch (key) {
      case "COUPLE":
        return details !== null && hasText(details.groomName) && hasText(details.brideName)
          ? { status: "COMPLETE", message: "Đã có tên cô dâu và chú rể" }
          : { status: "BLOCKING", message: "Thiếu tên cô dâu hoặc chú rể", nextAction: "Nhập đầy đủ tên cô dâu và chú rể" };
      case "EVENTS":
        return resolutions !== null && resolutions.length > 0 && resolutions.every((resolution) => resolution.status === "RESOLVED")
          ? { status: "COMPLETE", message: "Đã có lễ chính" }
          : { status: "BLOCKING", message: "Chưa có lễ chính hợp lệ", nextAction: "Thêm sự kiện lễ chính" };
      case "FAMILIES":
        return details !== null &&
          (hasText(details.groomFather) || hasText(details.groomMother)) &&
          (hasText(details.brideFather) || hasText(details.brideMother))
          ? { status: "COMPLETE", message: "Đã có thông tin gia đình hai bên" }
          : { status: "WARNING", message: "Chưa đủ thông tin gia đình hai bên", nextAction: "Bổ sung thông tin gia đình hai bên" };
      case "INVITATION_MESSAGE":
        return details !== null && hasText(details.invitationMessage) ? { status: "COMPLETE", message: "Đã có nội dung" } : NOT_USED;
      case "LOVE_STORY":
        return details !== null && hasText(details.loveStory) ? { status: "COMPLETE", message: "Đã có nội dung" } : NOT_USED;
      case "TIMELINE":
        return input.timelineItemCount > 0 ? { status: "COMPLETE", message: `Đã có ${input.timelineItemCount} mốc` } : NOT_USED;
      case "DRESS_CODE":
        return input.dressCode !== null && (hasText(input.dressCode.description) || input.dressCode.swatchCount > 0)
          ? { status: "COMPLETE", message: "Đã có nội dung" }
          : NOT_USED;
      case "GIFT":
        return details !== null && [...operationalSides].some((side) => giftSideMeaningful(details, side))
          ? { status: "COMPLETE", message: "Đã có thông tin mừng cưới" }
          : NOT_USED;
      case "MUSIC":
        return input.hasAudio ? { status: "COMPLETE", message: "Đã có nhạc nền" } : NOT_USED;
      default:
        return NOT_USED;
    }
  };

  const items: EditorReadinessItem[] = [];
  const nextCandidates: { rank: number; action: string }[] = [];

  for (const content of manifest.contentItems) {
    const evaluation = evaluateContent(content.key);
    items.push(item(content.key, "CONTENT", content.label, evaluation.status, evaluation.message));
    if (evaluation.nextAction !== undefined && evaluation.status === "BLOCKING") nextCandidates.push({ rank: 1, action: evaluation.nextAction });
    if (evaluation.nextAction !== undefined && evaluation.status === "WARNING") nextCandidates.push({ rank: 3, action: evaluation.nextAction });
  }

  if (manifest.mediaModel === "TEMPLATE_SLOTS") {
    if (input.slotCounts === "INVALID" || input.slotCounts === null) {
      items.push(item("TEMPLATE_MEDIA_INVALID", "MEDIA_SLOT", "Ảnh của mẫu thiệp", "BLOCKING", TEMPLATE_MEDIA_INVALID_MESSAGE));
      nextCandidates.push({ rank: 2, action: "Cấu hình lại ảnh của mẫu thiệp" });
    } else {
      for (const slot of manifest.mediaSlots) {
        const count = input.slotCounts[slot.key] ?? 0;
        if (slot.requirement === "RECOMMENDED") {
          if (count >= slot.recommendedCount) {
            items.push(item(slot.key, "MEDIA_SLOT", slot.label, "COMPLETE", `Đã có ${count}/${slot.recommendedCount} ảnh`));
          } else {
            items.push(item(slot.key, "MEDIA_SLOT", slot.label, "WARNING", `Đã có ${count}/${slot.recommendedCount} ảnh`));
            nextCandidates.push({ rank: 4, action: `Thêm ${slot.recommendedCount - count} ảnh vào ${slot.label}` });
          }
        } else {
          items.push(count > 0 ? item(slot.key, "MEDIA_SLOT", slot.label, "COMPLETE", `Đã có ${count} ảnh`) : item(slot.key, "MEDIA_SLOT", slot.label, "NOT_USED", "Không sử dụng"));
        }
      }
    }
  }

  // Stable by rank, then manifest order (insertion order within a rank).
  const next = [...nextCandidates].sort((a, b) => a.rank - b.rank)[0];
  return { overall: overallOf(items), items, nextAction: next?.action ?? READY_NEXT_ACTION };
}
