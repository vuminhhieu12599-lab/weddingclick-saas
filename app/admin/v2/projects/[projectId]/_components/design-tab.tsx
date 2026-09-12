import { EmptyState } from "../../../_components/page-states";

export function DesignTab() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <EmptyState
        title="Chưa có dữ liệu thiết kế"
        description="Tổng quan template và thiết lập thiết kế của dự án sẽ hiển thị ở đây khi tính năng Thiết kế được triển khai."
      />
    </div>
  );
}
