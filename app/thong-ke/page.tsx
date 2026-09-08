"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function StatisticsPage() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States cho Bộ lọc & Phân trang
  const [filters, setFilters] = useState({
    date: "all",
    status: "all",
    theme: "all",
    deadline: "all", // 'all' | 'upcoming' | 'today' | 'overdue' | 'no_deadline'
    search: ""
  });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('invitations').select('*').order('created_at', { ascending: false });
    if (data) {
      const normalizedData = data.map(item => ({
        ...item,
        status: item.status || "Đang làm", 
        deadline: item.deadline || ""
      }));
      setInvitations(normalizedData);
      setFilteredData(normalizedData);
    }
    setLoading(false);
  };

  // Cập nhật Trạng thái hoặc Deadline trực tiếp
  const handleUpdateRecord = async (id: string, field: string, value: string) => {
    const updatedInvs = invitations.map(inv => inv.id === id ? { ...inv, [field]: value } : inv);
    setInvitations(updatedInvs);
    
    const { error } = await supabase.from('invitations').update({ [field]: value }).eq('id', id);
    if (error) {
      alert(`Lỗi cập nhật ${field}: ` + error.message);
      fetchData();
    }
  };

  // Xóa trực tiếp bản ghi test
  const handleDeleteRecord = async (id: string) => {
    if (!confirm(`Bạn có chắc muốn xóa vĩnh viễn thiệp "${id}" không?`)) return;

    setInvitations(prev => prev.filter(item => item.id !== id));
    setFilteredData(prev => prev.filter(item => item.id !== id));

    await supabase.from('wishes').delete().eq('wedding_id', id);
    const { error } = await supabase.from('invitations').delete().eq('id', id);

    if (error) {
      alert("Lỗi khi xóa: " + error.message);
      fetchData();
    }
  };

  // Logic Lọc Dữ Liệu Đa Tầng
  useEffect(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    const in3Days = startOfToday + 3 * 24 * 60 * 60 * 1000;

    let result = [...invitations];

    // 1. Lọc theo Search (Tên / ID)
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(item => 
        item.id?.toLowerCase().includes(q) || 
        item.bride_name?.toLowerCase().includes(q) || 
        item.groom_name?.toLowerCase().includes(q)
      );
    }

    // 2. Lọc theo Trạng thái
    if (filters.status !== "all") {
      result = result.filter(item => item.status === filters.status);
    }

    // 3. Lọc theo Theme
    if (filters.theme !== "all") {
      result = result.filter(item => item.template_id === filters.theme);
    }

    // 4. Lọc theo Deadline
    if (filters.deadline !== "all") {
      result = result.filter(item => {
        if (!item.deadline) return filters.deadline === "no_deadline";
        const dTime = new Date(item.deadline).getTime();

        if (filters.deadline === "today") {
          return dTime >= startOfToday && dTime <= endOfToday;
        }
        if (filters.deadline === "upcoming") {
          // Trong vòng 3 ngày tới và chưa hoàn thành
          return dTime >= startOfToday && dTime <= in3Days && item.status !== "Hoàn thành";
        }
        if (filters.deadline === "overdue") {
          return dTime < startOfToday && item.status !== "Hoàn thành";
        }
        return true;
      });
    }

    // 5. Lọc theo Thời gian tạo
    result = result.filter((item) => {
      if (!item.created_at) return false;
      const createdAt = new Date(item.created_at);
      switch (filters.date) {
        case "today": return createdAt.toDateString() === now.toDateString();
        case "week": 
          const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
          return createdAt >= firstDay;
        case "month": return createdAt.getMonth() === new Date().getMonth() && createdAt.getFullYear() === new Date().getFullYear();
        case "year": return createdAt.getFullYear() === new Date().getFullYear();
        default: return true;
      }
    });

    setFilteredData(result);
    setCurrentPage(1);
  }, [filters, invitations]);

  // Phân trang
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const displayedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getThemeName = (id: string) => {
    if (id === 'theme_luxury') return "Nghệ Thuật Cao Cấp";
    if (id === 'theme_modern_minimal') return "Hiện Đại - Tối Giản";
    return "Truyền Thống - Đỏ";
  };

  // Thống kê nhanh
  const statTotal = filteredData.length;
  const statCompleted = filteredData.filter(i => i.status === 'Hoàn thành').length;
  const statWaiting = filteredData.filter(i => i.status === 'Chờ thông tin').length;
  const statDoing = filteredData.filter(i => i.status === 'Đang làm').length;
  const statModifying = filteredData.filter(i => i.status === 'Đang sửa lại').length;

  const todayMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const next3Days = todayMidnight + 3 * 24 * 60 * 60 * 1000;

  const statUpcoming = filteredData.filter(i => {
    if (!i.deadline || i.status === 'Hoàn thành') return false;
    const t = new Date(i.deadline).getTime();
    return t >= todayMidnight && t <= next3Days;
  }).length;

  const statOverdue = filteredData.filter(i => {
    if (!i.deadline || i.status === 'Hoàn thành') return false;
    return new Date(i.deadline).getTime() < todayMidnight;
  }).length;

  const statusColors: Record<string, string> = {
    "Đang làm": "bg-blue-100 text-blue-700 border-blue-200",
    "Chờ thông tin": "bg-amber-100 text-amber-700 border-amber-200",
    "Đang sửa lại": "bg-purple-100 text-purple-700 border-purple-200",
    "Hoàn thành": "bg-green-100 text-green-700 border-green-200"
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-8 font-sans pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-[#1a2b4c]">Thống Kê & Quản Lý Tiến Độ</h1>
            <p className="text-sm text-gray-500 mt-1">Theo dõi danh sách khách hàng, deadline và trạng thái hoàn thiện thiệp</p>
          </div>
          <a href="/dashboard" className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition text-sm">
            ← Trở về Quản lý Dự Án
          </a>
        </div>

        {/* Khối Thống kê */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-gray-800">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tổng hiển thị</p>
            <p className="text-3xl font-black text-gray-800 mt-1">{statTotal}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-500">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Đang làm</p>
            <p className="text-3xl font-black text-blue-600 mt-1">{statDoing}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-amber-500">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Chờ thông tin</p>
            <p className="text-3xl font-black text-amber-500 mt-1">{statWaiting}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-purple-500">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Đang sửa lại</p>
            <p className="text-3xl font-black text-purple-600 mt-1">{statModifying}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-orange-500">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Hạn 3 ngày tới</p>
            <p className="text-3xl font-black text-orange-600 mt-1">{statUpcoming}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-red-500">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quá hạn</p>
            <p className="text-3xl font-black text-red-500 mt-1">{statOverdue}</p>
          </div>
        </div>

        {/* Thanh Bộ Lọc Đa Tầng */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex-1 min-w-[220px]">
            <input 
              type="text" placeholder="🔍 Tìm ID, Tên Dâu Rể..." 
              value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})}
              className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#9B1B1B]"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Lọc Trạng thái */}
            <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})} className="bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-lg text-sm outline-none font-medium text-gray-700">
              <option value="all">Mọi trạng thái</option>
              <option value="Đang làm">Đang làm</option>
              <option value="Chờ thông tin">Chờ thông tin</option>
              <option value="Đang sửa lại">Đang sửa lại</option>
              <option value="Hoàn thành">Hoàn thành</option>
            </select>
            
            {/* Lọc Deadline */}
            <select value={filters.deadline} onChange={(e) => setFilters({...filters, deadline: e.target.value})} className="bg-orange-50 border border-orange-200 px-3 py-2.5 rounded-lg text-sm outline-none font-semibold text-orange-800">
              <option value="all">Mọi Deadline</option>
              <option value="upcoming">⏳ Sắp tới (trong 3 ngày)</option>
              <option value="today">📅 Hôm nay</option>
              <option value="overdue">🚨 Đã quá hạn</option>
              <option value="no_deadline">Chưa đặt deadline</option>
            </select>

            {/* Lọc Theme */}
            <select value={filters.theme} onChange={(e) => setFilters({...filters, theme: e.target.value})} className="bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-lg text-sm outline-none font-medium text-gray-700">
              <option value="all">Mọi Theme</option>
              <option value="theme_luxury">Nghệ Thuật Cao Cấp</option>
              <option value="theme_traditional_red">Truyền Thống - Đỏ</option>
              <option value="theme_modern_minimal">Hiện Đại - Tối Giản</option>
            </select>

            {/* Lọc Thời gian tạo */}
            <select value={filters.date} onChange={(e) => setFilters({...filters, date: e.target.value})} className="bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-lg text-sm outline-none font-medium text-gray-700">
              <option value="all">Mọi ngày tạo</option>
              <option value="today">Hôm nay</option>
              <option value="week">Tuần này</option>
              <option value="month">Tháng này</option>
              <option value="year">Năm nay</option>
            </select>
          </div>
        </div>

        {/* Bảng Dữ Liệu */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-gray-400 font-bold flex flex-col items-center">
              <span className="text-3xl animate-spin mb-4">⏳</span> Đang tải dữ liệu...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="p-4 border-b font-bold">Ngày Tạo</th>
                    <th className="p-4 border-b font-bold">Thiệp & Khách hàng</th>
                    <th className="p-4 border-b font-bold">Mẫu Giao Diện</th>
                    <th className="p-4 border-b font-bold">Tiến độ (Trạng thái)</th>
                    <th className="p-4 border-b font-bold">Deadline</th>
                    <th className="p-4 border-b font-bold text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedData.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-gray-400 font-medium">Không tìm thấy dữ liệu phù hợp với bộ lọc.</td></tr>
                  ) : (
                    displayedData.map((item) => {
                      const dTime = item.deadline ? new Date(item.deadline).getTime() : 0;
                      const isOverdue = dTime && dTime < todayMidnight && item.status !== 'Hoàn thành';
                      const isUpcoming = dTime && dTime >= todayMidnight && dTime <= next3Days && item.status !== 'Hoàn thành';

                      return (
                        <tr key={item.id} className="hover:bg-blue-50/40 transition-colors text-sm">
                          <td className="p-4 text-gray-500 font-medium">
                            {item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : 'N/A'}
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-gray-900">{item.bride_name} & {item.groom_name}</div>
                            <div className="font-mono text-xs text-[#9B1B1B] mt-1 hover:underline cursor-pointer" onClick={() => window.open(`/${item.id}`, '_blank')}>
                              ID: {item.id}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-md text-[11px] font-bold">
                              {getThemeName(item.template_id)}
                            </span>
                          </td>
                          <td className="p-4">
                            {/* Trạng thái - Click đổi nhanh */}
                            <select 
                              value={item.status} 
                              onChange={(e) => handleUpdateRecord(item.id, 'status', e.target.value)}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold border outline-none cursor-pointer appearance-none text-center min-w-[120px] ${statusColors[item.status] || statusColors['Đang làm']}`}
                            >
                              <option value="Đang làm">Đang làm</option>
                              <option value="Chờ thông tin">Chờ thông tin</option>
                              <option value="Đang sửa lại">Đang sửa lại</option>
                              <option value="Hoàn thành">Hoàn thành</option>
                            </select>
                          </td>
                          <td className="p-4">
                            {/* Deadline input */}
                            <div className="flex items-center gap-2">
                              <input 
                                type="date" 
                                value={item.deadline}
                                onChange={(e) => handleUpdateRecord(item.id, 'deadline', e.target.value)}
                                className={`border px-3 py-1.5 rounded-md text-sm outline-none transition-colors ${
                                  isOverdue 
                                    ? 'border-red-400 text-red-600 bg-red-50 font-bold' 
                                    : isUpcoming 
                                    ? 'border-orange-400 text-orange-600 bg-orange-50 font-bold'
                                    : 'border-gray-200 text-gray-600 bg-gray-50 focus:border-blue-400'
                                }`}
                              />
                              {isOverdue && <span className="text-[11px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">Quá hạn</span>}
                              {isUpcoming && <span className="text-[11px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">Gấp</span>}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleDeleteRecord(item.id)}
                              title="Xóa vĩnh viễn thiệp"
                              className="px-3 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors font-semibold text-xs border border-transparent hover:border-red-200"
                            >
                              🗑 Xóa
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Footer - Phân trang */}
          <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center text-sm">
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              Hiển thị
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="border border-gray-200 rounded p-1 outline-none">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
              bản ghi / trang
            </div>

            <div className="flex items-center gap-4">
              <span className="text-gray-500 font-medium">Trang {currentPage} / {totalPages}</span>
              <div className="flex gap-1">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Trước
                </button>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}