"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";

export default function GuestListPage() {
  const params = useParams();
  const id = params.id;

  const [wedding, setWedding] = useState<any>(null);
  const [wishes, setWishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Lấy thông tin cô dâu chú rể
      const { data: wedData } = await supabase.from("weddings").select("*").eq("id", id).single();
      if (wedData) setWedding(wedData);

      // 2. Lấy danh sách lời chúc / khách tham dự của riêng ID này
      const { data: wishData } = await supabase.from("wishes").select("*").eq("wedding_id", id).order("created_at", { ascending: false });
      if (wishData) setWishes(wishData);

      setLoading(false);
    };
    fetchData();
  }, [id]);

  // Hàm xuất file Excel trực tiếp từ trình duyệt (Đã sửa lỗi lặp số 0)
  const exportToExcel = () => {
    if (wishes.length === 0) {
      alert("Chưa có dữ liệu khách mời để tải xuống!");
      return;
    }

    const headers = ["STT", "Tên khách mời", "Trạng thái tham dự", "Lời chúc", "Thời gian"];
    
    const rows = wishes.map((w, index) => {
      const time = new Date(w.created_at).toLocaleString("vi-VN");
      const cleanMessage = w.message ? `"${w.message.replace(/"/g, '""')}"` : '""';
      const cleanName = `"${w.guest_name.replace(/"/g, '""')}"`;
      return [index + 1, cleanName, `"${w.attendance}"`, cleanMessage, `"${time}"`];
    });

    let csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Danh_sach_khach_moi_Dam_cuoi_${wedding?.groom_name}_${wedding?.bride_name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-[#9B1B1B]">Đang tải danh sách...</div>;
  if (!wedding) return <div className="h-screen flex items-center justify-center text-red-500 font-bold">Không tìm thấy thông tin đám cưới!</div>;

  const totalGuests = wishes.length;
  const attendingCount = wishes.filter(w => w.attendance === "Có tham dự").length;
  const absentCount = wishes.filter(w => w.attendance === "Không tham dự").length;

  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#9B1B1B] text-white p-6 md:p-8 text-center relative">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Sổ Quản Lý Khách Mời</h1>
          <p className="text-[#E5C158] text-sm md:text-base font-medium">Đám cưới: {wedding.groom_name} & {wedding.bride_name}</p>
        </div>

        <div className="p-6 md:p-8">
          
          {/* Thống kê nhanh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-center shadow-sm">
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">Tổng số phản hồi</p>
              <p className="text-3xl font-bold text-blue-600">{totalGuests}</p>
            </div>
            <div className="bg-green-50 border border-green-100 p-4 rounded-xl text-center shadow-sm">
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">Xác nhận tham dự</p>
              <p className="text-3xl font-bold text-green-600">{attendingCount}</p>
            </div>
            <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-center shadow-sm">
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">Báo vắng mặt</p>
              <p className="text-3xl font-bold text-red-600">{absentCount}</p>
            </div>
          </div>

          {/* Nút tải Excel */}
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="text-lg font-bold text-gray-800">Chi tiết lời chúc & xác nhận</h2>
            <button 
              onClick={exportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition shadow-md flex items-center gap-2 text-sm"
            >
              📊 Tải File Excel (CSV)
            </button>
          </div>

          {/* Bảng danh sách */}
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-600">
                  <th className="p-4">STT</th>
                  <th className="p-4">Tên khách mời</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4">Lời chúc</th>
                  <th className="p-4">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {wishes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400 italic">Chưa có phản hồi nào từ khách mời.</td>
                  </tr>
                ) : (
                  wishes.map((w, index) => (
                    <tr key={w.id || index} className="hover:bg-gray-50 transition">
                      <td className="p-4 text-gray-500 font-medium">{index + 1}</td>
                      <td className="p-4 font-bold text-gray-800">{w.guest_name}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${w.attendance === "Có tham dự" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {w.attendance}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 max-w-xs truncate">{w.message || "(Không có lời chúc)"}</td>
                      <td className="p-4 text-gray-400 text-xs">{new Date(w.created_at).toLocaleString("vi-VN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}