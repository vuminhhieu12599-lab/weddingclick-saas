"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

export default function Dashboard() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wishes, setWishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvitations = async () => {
      const { data } = await supabase.from('invitations').select('id, couple_id, groom_name, bride_name, wedding_date').order('created_at', { ascending: false });
      if (data) {
        setInvitations(data);
        if (data.length > 0) setSelectedId(data[0].id);
      }
      setLoading(false);
    };
    fetchInvitations();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const fetchWishes = async () => {
      const { data } = await supabase.from('wishes').select('*').eq('wedding_id', selectedId).order('created_at', { ascending: false });
      if (data) setWishes(data);
    };
    fetchWishes();
  }, [selectedId]);

  const attendingCount = wishes.filter(w => w.attendance === 'Có tham dự').length;
  const declineCount = wishes.filter(w => w.attendance === 'Không tham dự').length;
  const currentWedding = invitations.find(i => i.id === selectedId);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-[#9B1B1B] font-bold">Đang tải dữ liệu...</div>;

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans flex flex-col md:flex-row">
      
      {/* CỘT TRÁI */}
      <div className="w-full md:w-1/4 bg-white border-r border-gray-200 h-screen overflow-y-auto sticky top-0 shadow-sm z-10">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <h1 className="text-xl font-bold text-gray-800">Quản Lý Dự Án</h1>
          <p className="text-xs text-gray-500 mt-1">Tổng số: {invitations.length} thiệp cưới</p>
        </div>
        
        <div className="p-4 space-y-2">
          {invitations.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">Chưa có thiệp nào.</p> : (
            invitations.map((inv) => (
              <div key={inv.id} onClick={() => setSelectedId(inv.id)} className={`p-4 rounded-xl cursor-pointer transition border-2 ${selectedId === inv.id ? 'border-[#E5C158] bg-[#FDFBF7]' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}>
                <div className="font-bold text-[#9B1B1B] text-sm">{inv.groom_name || "Chú Rể"} & {inv.bride_name || "Cô Dâu"}</div>
                <div className="text-xs text-gray-500 mt-1 flex justify-between"><span>ID: {inv.id}</span><span>{inv.wedding_date}</span></div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-gray-100 mt-auto"><Link href="/admin"><button className="w-full bg-[#9B1B1B] text-white py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-red-800 transition">+ Tạo thiệp mới</button></Link></div>
      </div>

      {/* CỘT PHẢI */}
      <div className="w-full md:w-3/4 p-4 md:p-8 overflow-y-auto h-screen">
        {!selectedId ? (
          <div className="h-full flex items-center justify-center text-gray-400">Vui lòng chọn một thiệp bên trái để xem chi tiết.</div>
        ) : (
          <div className="max-w-4xl mx-auto">
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-1">{currentWedding?.groom_name} & {currentWedding?.bride_name}</h2>
                <p className="text-sm text-gray-500">Mã thiệp: <span className="font-mono text-[#9B1B1B] font-bold">{selectedId}</span></p>
              </div>
              <div className="flex gap-3">
                <Link href={`/${selectedId}`} target="_blank"><button className="bg-white border-2 border-[#E5C158] text-[#9B1B1B] px-4 py-2 rounded-lg font-bold text-sm hover:bg-[#FDFBF7] transition">👁️ Xem Thiệp</button></Link>
                <Link href={`/admin?id=${selectedId}`}><button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-200 transition shadow-sm">✏️ Sửa Thiệp</button></Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl">✉️</div><div><p className="text-sm text-gray-500 font-semibold">Tổng lời chúc</p><p className="text-2xl font-bold text-gray-800">{wishes.length}</p></div></div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-green-200 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl">✅</div><div><p className="text-sm text-gray-500 font-semibold">Sẽ tham dự</p><p className="text-2xl font-bold text-green-600">{attendingCount} khách</p></div></div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-200 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl">❌</div><div><p className="text-sm text-gray-500 font-semibold">Không tham dự</p><p className="text-2xl font-bold text-red-500">{declineCount} khách</p></div></div>
            </div>

            {/* BẢNG LỜI CHÚC (ĐÃ TỐI ƯU HIỂN THỊ 100% RESPONSIVE) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-800">Danh sách Xác nhận (RSVP)</h3>
              </div>
              
              <div className="divide-y divide-gray-100">
                {wishes.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">Chưa có khách mời nào xác nhận.</div>
                ) : (
                  wishes.map((wish) => (
                    <div key={wish.id} className="p-5 md:p-6 hover:bg-gray-50 transition flex flex-col md:flex-row gap-2 md:gap-4 md:items-start">
                      
                      {/* Cột 1: Tên và Thời gian */}
                      <div className="md:w-1/4 flex flex-col">
                        <span className="font-bold text-gray-800 text-base">{wish.guest_name}</span>
                        <span className="text-xs text-gray-400 mt-1">{new Date(wish.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                      
                      {/* Cột 2: Trạng thái */}
                      <div className="md:w-1/5 mt-1 md:mt-0">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full inline-block ${wish.attendance === 'Có tham dự' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {wish.attendance}
                        </span>
                      </div>
                      
                      {/* Cột 3: Lời chúc (Tự động rớt dòng, không bị cắt dấu ...) */}
                      <div className="md:w-7/12 text-sm text-gray-600 italic mt-2 md:mt-0 whitespace-normal leading-relaxed">
                        "{wish.message || 'Không có lời chúc'}"
                      </div>
                      
                    </div>
                  ))
                )}
              </div>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}