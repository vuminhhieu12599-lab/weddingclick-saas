"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function Dashboard() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wishes, setWishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState("");

  // 1. Tải danh sách thiệp (Sắp xếp mới nhất lên đầu)
  useEffect(() => {
    const fetchInvitations = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && !error) {
        setInvitations(data);
        if (data.length > 0) setSelectedId(data[0].id);
      }
      setLoading(false);
    };

    fetchInvitations();
  }, []);

  // 2. Tải danh sách lời chúc khi chọn một thiệp
  useEffect(() => {
    if (!selectedId) return;
    const fetchWishes = async () => {
      const { data } = await supabase
        .from('wishes')
        .select('*')
        .eq('wedding_id', selectedId)
        .order('created_at', { ascending: false });
      if (data) setWishes(data);
    };
    fetchWishes();
  }, [selectedId]);

  const handleDelete = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa vĩnh viễn thiệp này không?")) {
      await supabase.from('invitations').delete().eq('id', id);
      setInvitations(invitations.filter(inv => inv.id !== id));
      if (selectedId === id) setSelectedId(invitations[0]?.id || null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Đã copy link!");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Hàm chuyển đổi mã Template sang tên Tiếng Việt
  const getThemeName = (templateId: string) => {
    if (templateId === 'theme_traditional_red') return "Truyền Thống - Đỏ";
    if (templateId === 'theme_modern_minimal') return "Hiện Đại - Tối Giản";
    return "Mặc định";
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Đang tải dữ liệu...</div>;

  const filteredInvitations = invitations.filter(inv => 
    inv.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    inv.bride_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    inv.groom_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedInv = invitations.find(inv => inv.id === selectedId);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const totalWishes = wishes.length;
  const attendingCount = wishes.filter(w => w.attendance === 'Có tham dự').length;
  const notAttendingCount = wishes.filter(w => w.attendance === 'Không tham dự').length;

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex font-sans">
      
      {/* CỘT TRÁI: QUẢN LÝ DỰ ÁN */}
      <div className="w-80 bg-white border-r border-gray-200 h-screen flex flex-col flex-shrink-0 sticky top-0">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-[#1a2b4c]">Quản Lý Dự Án</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng số: {invitations.length} thiệp cưới</p>
        </div>
        
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Tìm tên hoặc ID thiệp..." 
              value={searchTerm}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#9B1B1B]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredInvitations.map((inv) => (
            <div 
              key={inv.id} 
              onClick={() => setSelectedId(inv.id)}
              className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${selectedId === inv.id ? 'border-[#9B1B1B] bg-red-50/30 shadow-sm' : 'border-transparent bg-gray-50 hover:bg-gray-100 border-gray-100'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className={`font-bold ${selectedId === inv.id ? 'text-[#9B1B1B]' : 'text-gray-800'}`}>
                  {inv.groom_name} & {inv.bride_name}
                </h3>
                <span className="text-xs text-gray-400">{inv.wedding_date}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">ID: {inv.id}</p>
              <span className="inline-block bg-white border border-gray-200 text-gray-600 text-[10px] px-2 py-1 rounded shadow-sm font-medium">
                🎨 {getThemeName(inv.template_id)}
              </span>
            </div>
          ))}
          {filteredInvitations.length === 0 && (
            <p className="text-center text-gray-400 text-sm mt-10">Không tìm thấy thiệp nào.</p>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white space-y-3">
          <Link href="/admin" className="block w-full text-center bg-[#9B1B1B] text-white py-3 rounded-lg font-bold hover:bg-red-800 transition shadow-md">
            + Tạo thiệp mới
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 text-red-600 rounded-lg font-bold hover:bg-red-100 transition text-sm">
            <span className="flex items-center gap-2"><span className="bg-red-200 text-red-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">N</span> Đăng Xuất</span>
          </button>
        </div>
      </div>

      {/* CỘT PHẢI: CHI TIẾT THIỆP */}
      <div className="flex-1 overflow-y-auto p-8">
        {selectedInv ? (
          <div className="max-w-4xl mx-auto space-y-6">
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedInv.groom_name} & {selectedInv.bride_name}</h2>
                <p className="text-gray-500 mt-1 font-medium">Mã thiệp: <span className="text-[#9B1B1B]">{selectedInv.id}</span></p>
              </div>
              <div className="flex gap-3">
                <a href={`/${selectedInv.id}`} target="_blank" className="px-5 py-2.5 bg-amber-50 text-amber-700 font-bold rounded-lg hover:bg-amber-100 transition border border-amber-200 text-sm flex items-center gap-2">
                  👁 Xem
                </a>
                <Link href={`/admin?id=${selectedInv.id}`} className="px-5 py-2.5 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 transition border border-blue-200 text-sm flex items-center gap-2">
                  ✏️ Sửa
                </Link>
                <button onClick={() => handleDelete(selectedInv.id)} className="px-5 py-2.5 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 transition border border-red-200 text-sm flex items-center gap-2">
                  🗑 Xóa
                </button>
              </div>
            </div>

            {/* BỘ LINK BÀN GIAO KHÁCH HÀNG (Khôi phục logic VIP nguyên bản) */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5C158]/40 border-t-4 border-t-[#E5C158]">
              <h3 className="font-bold text-[#9B1B1B] mb-6 flex items-center gap-2">🔗 BỘ LINK BÀN GIAO KHÁCH HÀNG</h3>
              
              <div className="space-y-5">
                {/* 1. Link Thiệp Gốc */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-gray-700 w-36 shrink-0">1. Link Thiệp Gốc:</span>
                  <input readOnly value={`${baseUrl}/${selectedInv.id}`} className="flex-1 border border-gray-200 bg-gray-50 p-3 rounded-lg text-sm text-gray-600 outline-none" />
                  <button onClick={() => handleCopy(`${baseUrl}/${selectedInv.id}`)} className="bg-blue-100 text-blue-700 px-6 py-3 rounded-lg font-bold text-sm hover:bg-blue-200 transition-colors">Copy</button>
                </div>

                {/* 2. Công cụ VIP */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-gray-700 w-36 shrink-0">2. Công cụ VIP:</span>
                  <input readOnly value={`${baseUrl}/${selectedInv.id}/vip`} className="flex-1 border border-purple-200 bg-purple-50/50 p-3 rounded-lg text-sm text-purple-700 outline-none font-medium" />
                  <button onClick={() => handleCopy(`${baseUrl}/${selectedInv.id}/vip`)} className="bg-purple-100 text-purple-700 px-6 py-3 rounded-lg font-bold text-sm hover:bg-purple-200 transition-colors">Copy</button>
                </div>

                {/* 3. Xem Lời Chúc */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-gray-700 w-36 shrink-0">3. Xem Lời Chúc:</span>
                  <input readOnly value={`${baseUrl}/${selectedInv.id}/rsvp`} className="flex-1 border border-gray-200 bg-gray-50 p-3 rounded-lg text-sm text-gray-600 outline-none" />
                  <button onClick={() => handleCopy(`${baseUrl}/${selectedInv.id}/rsvp`)} className="bg-green-100 text-green-700 px-6 py-3 rounded-lg font-bold text-sm hover:bg-green-200 transition-colors">Copy</button>
                </div>
              </div>
            </div>

            {/* Thống kê RSVP */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl">✉️</div>
                <div>
                  <p className="text-sm font-bold text-gray-500">Tổng lời chúc</p>
                  <p className="text-2xl font-black text-gray-900">{totalWishes}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 flex items-center gap-4 shadow-green-50">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold">✓</div>
                <div>
                  <p className="text-sm font-bold text-gray-500">Sẽ tham dự</p>
                  <p className="text-2xl font-black text-green-600">{attendingCount} <span className="text-sm font-semibold">khách</span></p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 flex items-center gap-4 shadow-red-50">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 text-xl font-bold">✕</div>
                <div>
                  <p className="text-sm font-bold text-gray-500">Không tham dự</p>
                  <p className="text-2xl font-black text-red-500">{notAttendingCount} <span className="text-sm font-semibold">khách</span></p>
                </div>
              </div>
            </div>

            {/* Bảng Danh sách Xác nhận */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-800">Danh sách Xác nhận (RSVP)</h3>
              </div>
              
              {wishes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="p-4 font-semibold">Khách mời</th>
                        <th className="p-4 font-semibold">Xác nhận</th>
                        <th className="p-4 font-semibold w-1/2">Lời chúc</th>
                        <th className="p-4 font-semibold text-right">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {wishes.map((w) => (
                        <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 font-bold text-gray-800">{w.guest_name}</td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${w.attendance === 'Có tham dự' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {w.attendance}
                            </span>
                          </td>
                          <td className="p-4 text-gray-600 italic">"{w.message}"</td>
                          <td className="p-4 text-right text-xs text-gray-400">
                            {new Date(w.created_at).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-gray-400 font-medium">
                  Chưa có khách mời nào xác nhận.
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 font-medium">
            👈 Hãy chọn một thiệp cưới bên trái để xem chi tiết
          </div>
        )}
      </div>
    </div>
  );
}