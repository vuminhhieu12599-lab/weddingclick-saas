"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import ThemeTraditional from "../../components/ThemeTraditional";
import ThemeModern from "../../components/ThemeModern"; // Đã bổ sung dòng này

export default function InvitationRouter() {
  const params = useParams();
  const id = params?.id as string;
  
  const [guestName, setGuestName] = useState("");
  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Lấy tên khách mời từ URL an toàn
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const guest = searchParams.get("guest") || "";
      setGuestName(guest);
    }
  }, []);

  // Tải dữ liệu thiệp từ Supabase
  useEffect(() => {
    if (!id) return;
    const fetchInvitation = async () => {
      const { data } = await supabase.from('invitations').select('*').eq('id', id).single();
      if (data) setInvitation(data);
      setLoading(false);
    };
    fetchInvitation();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-bold">Đang tải dữ liệu thiệp...</div>;
  if (!invitation) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-bold">Không tìm thấy thiệp cưới!</div>;

  // HỆ THỐNG ĐIỀU HƯỚNG GIAO DIỆN (ROUTER)
  
  if (invitation.template_id === 'theme_traditional_red') {
    return <ThemeTraditional invitation={invitation} guestName={guestName} id={id} />;
  }

  // Đã bổ sung logic điều hướng cho mẫu Hiện đại
  if (invitation.template_id === 'theme_modern_minimal') {
    return <ThemeModern invitation={invitation} guestName={guestName} id={id} />;
  }

  // Nếu không tìm thấy theme trùng khớp, tự động hiển thị mẫu mặc định
  return <ThemeTraditional invitation={invitation} guestName={guestName} id={id} />;
}