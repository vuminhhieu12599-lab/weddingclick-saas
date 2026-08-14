"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";

export default function RSVPViewer() {
  const params = useParams();
  const id = params.id;
  
  const [weddingInfo, setWeddingInfo] = useState<any>(null);
  const [wishes, setWishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Tải thông tin cô dâu chú rể
      const { data: wedData } = await supabase.from('invitations').select('groom_name, bride_name').eq('id', id).single();
      if (wedData) setWeddingInfo(wedData);

      // Tải danh sách lời chúc
      const { data: wishesData } = await supabase.from('wishes').select('*').eq('wedding_id', id).order('created_at', { ascending: false });
      if (wishesData) setWishes(wishesData);

      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-[#9B1B1B] font-bold">Đang tải dữ liệu...</div>;
  if (!weddingInfo) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-red-500">Không tìm thấy dữ liệu.</div>;

  const attendingCount = wishes.filter(w => w.attendance === 'Có tham dự').length;
  const declineCount = wishes.filter(w => w.attendance === 'Không tham dự').length;

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8 text-center">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Thống Kê Khách Mời</h2>
          <h1 className="text-3xl font-bold text-[#9B1B1B]">{weddingInfo.groom_name} & {weddingInfo.bride_name}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl flex-shrink-0">✉️</div><div><p className="text-sm text-gray-500 font-semibold">Tổng lời chúc</p><p className="text-2xl font-bold text-gray-800">{wishes.length}</p></div></div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-green-200 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl flex-shrink-0">✅</div><div><p className="text-sm text-gray-500 font-semibold">Sẽ tham dự</p><p className="text-2xl font-bold text-green-600">{attendingCount} khách</p></div></div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-200 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl flex-shrink-0">❌</div><div><p className="text-sm text-gray-500 font-semibold">Không tham dự</p><p className="text-2xl font-bold text-red-500">{declineCount} khách</p></div></div>
        </div>

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
                  <div className="md:w-1/4 flex flex-col">
                    <span className="font-bold text-gray-800 text-base">{wish.guest_name}</span>
                    <span className="text-xs text-gray-400 mt-1">{new Date(wish.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="md:w-1/5 mt-1 md:mt-0">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full inline-block ${wish.attendance === 'Có tham dự' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {wish.attendance}
                    </span>
                  </div>
                  <div className="md:w-7/12 text-sm text-gray-600 italic mt-2 md:mt-0 whitespace-normal leading-relaxed">
                    "{wish.message || 'Không có lời chúc'}"
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}