"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import ThemeTraditional from "../../components/ThemeTraditional";
import ThemeModern from "../../components/ThemeModern";
import ThemeLuxury from "../../components/ThemeLuxury";

export default function InvitationRouter() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const rawId = params?.id as string;
  // Xử lý thông minh: Giải mã URL (biến %20 thành dấu cách) để luôn tìm đúng ID trong Database
  const id = rawId ? decodeURIComponent(rawId) : "";
  
  const guestName = searchParams?.get("guest") || "";

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchInvitation = async () => {
      const { data } = await supabase.from('invitations').select('*').eq('id', id).single();
      if (data) setInvitation(data);
      setLoading(false);
    };
    fetchInvitation();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-bold">Đang tải dữ liệu...</div>;
  
  if (!invitation) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-red-500 font-bold text-xl">Không tìm thấy thiệp cưới!</div>;

  // ================= ĐIỀU HƯỚNG GIAO DIỆN =================
  
  // 1. Mẫu Nghệ Thuật Cao Cấp (Mới)
  if (invitation.template_id === 'theme_luxury') {
    return <ThemeLuxury invitation={invitation} guestName={guestName} id={id} />;
  }
  
  // 2. Mẫu Hiện Đại
  if (invitation.template_id === 'theme_modern_minimal') {
    return <ThemeModern invitation={invitation} guestName={guestName} id={id} />;
  }

  // 3. Mặc định (Truyền thống đỏ)
  return <ThemeTraditional invitation={invitation} guestName={guestName} id={id} />;
}