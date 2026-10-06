"use client";

import Link from "next/link";

import { PageHeader } from "../../_components/page-header";
import { ProjectCreateForm } from "./_components/project-create-form";

/**
 * Launch Hardening 03 / P0-3 — staff start of the workflow: create the
 * Customer, then the Project with its package and add-ons, through the
 * existing internal API routes only. Wedding content, design and review are
 * entered later in the Project workspace.
 */
export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Tạo dự án"
        subtitle="Nhập thông tin khách hàng và chọn gói dịch vụ. Nội dung thiệp được nhập sau trong trang dự án."
        actions={
          <Link href="/admin/v2/projects" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Quay lại danh sách
          </Link>
        }
      />
      <ProjectCreateForm />
    </div>
  );
}
