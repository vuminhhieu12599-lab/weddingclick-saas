"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import * as XLSX from 'xlsx';

interface GeneratedLink {
  name: string;
  url: string;
  copied: boolean;
}

export default function VIPPortal() {
  const params = useParams();
  const id = params?.id;
  const [baseUrl, setBaseUrl] = useState("");
  
  // State quản lý Tab (Nhập tay vs Excel)
  const [activeTab, setActiveTab] = useState<'text' | 'excel'>('text');
  
  // States cho Tab Nhập tay
  const [guestInput, setGuestInput] = useState("");
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);

  // States cho Tab Excel
  const [excelProcessing, setExcelProcessing] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  // ================= PHẦN 1: LOGIC NHẬP TAY (GIỮ NGUYÊN) =================
  const handleTextGenerate = () => {
    if (!guestInput.trim()) return;
    const names = guestInput.split('\n').map(name => name.trim()).filter(name => name !== "");
    const links = names.map(name => ({
      name,
      url: `${baseUrl}/${id}?guest=${encodeURIComponent(name)}`,
      copied: false
    }));
    setGeneratedLinks(links);
  };

  const handleCopy = (index: number) => {
    const linkToCopy = generatedLinks[index];
    navigator.clipboard.writeText(linkToCopy.url);
    setGeneratedLinks(prev => prev.map((link, i) => i === index ? { ...link, copied: true } : { ...link, copied: false }));
    setTimeout(() => {
      setGeneratedLinks(prev => prev.map((link, i) => i === index ? { ...link, copied: false } : link));
    }, 2000);
  };

  // ================= PHẦN 2: LOGIC XỬ LÝ EXCEL =================
  
  // Hàm tải file mẫu Excel
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Tên Khách Mời"],
    ]);
    // Mở rộng cột cho đẹp
    ws['!cols'] = [{ wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSachKhach");
    XLSX.writeFile(wb, "Mau_Danh_Sach_Khach_Moi.xlsx");
  };

  // Hàm xử lý khi người dùng upload file Excel
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Lấy sheet đầu tiên
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Chuyển sheet thành dạng mảng JSON (Bỏ qua dòng tiêu đề)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // Cấu trúc lại dữ liệu mới để xuất ra (Mảng các mảng)
        const newExcelData = [["Tên Khách Mời", "Link Thiệp"]]; // Dòng tiêu đề

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row.length > 0 && row[0]) { // Nếu cột đầu tiên (Tên) có dữ liệu
            const guestName = String(row[0]).trim();
            const link = `${baseUrl}/${id}?guest=${encodeURIComponent(guestName)}`;
            newExcelData.push([guestName, link]);
          }
        }

        if (newExcelData.length === 1) {
          alert("File Excel của bạn không có dữ liệu khách mời, vui lòng kiểm tra lại cột 'Tên Khách Mời'.");
          setExcelProcessing(false);
          return;
        }

        // Tạo sheet mới từ dữ liệu đã xử lý
        const newWs = XLSX.utils.aoa_to_sheet(newExcelData);
        // Căn chỉnh độ rộng cột
        newWs['!cols'] = [{ wch: 30 }, { wch: 70 }];
        const newWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWb, newWs, "Link Khach Moi");
        
        // Tải xuống file kết quả
        XLSX.writeFile(newWb, "Danh_Sach_Link_Thiep.xlsx");
        
        alert(`🎉 Thành công! Đã tạo xong ${newExcelData.length - 1} link và tải xuống máy của bạn.`);
      } catch (error) {
        alert("Có lỗi xảy ra khi đọc file Excel. Vui lòng đảm bảo bạn dùng đúng file mẫu.");
        console.error(error);
      } finally {
        setExcelProcessing(false);
        e.target.value = ''; // Reset input
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4 font-sans py-12">
      <div className="bg-white max-w-2xl w-full p-8 rounded-3xl shadow-xl border-2 border-[#E5C158]">
        
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-[#9B1B1B] mb-2">💎 Trợ Lý Tạo Thiệp VIP</h1>
          <p className="text-sm text-gray-500">Công cụ tự động hóa link thiệp cho hàng trăm khách mời.</p>
        </div>

        {/* Tab Chuyển Đổi */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
          <button 
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'text' ? 'bg-white shadow-sm text-[#9B1B1B]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            ✍️ Nhập Tay (Nhanh)
          </button>
          <button 
            onClick={() => setActiveTab('excel')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'excel' ? 'bg-white shadow-sm text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📊 Xử Lý Bằng Excel
          </button>
        </div>

        {/* ================= TAB 1: NHẬP TAY ================= */}
        {activeTab === 'text' && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Nhập danh sách Khách (Mỗi người 1 dòng):</label>
              <textarea 
                value={guestInput} 
                onChange={(e) => setGuestInput(e.target.value)}
                placeholder="VD:&#10;Gia đình Anh Hiếu&#10;Chú Nam..."
                rows={6}
                className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#9B1B1B] focus:outline-none transition text-gray-800 resize-y"
              />
            </div>
            <button 
              onClick={handleTextGenerate}
              className="w-full bg-[#9B1B1B] text-white font-bold py-4 rounded-xl hover:bg-red-800 transition shadow-lg text-lg"
            >
              Tạo Danh Sách Link
            </button>

            {generatedLinks.length > 0 && (
              <div className="mt-8">
                <div className="flex justify-between items-center border-b-2 border-gray-100 pb-3 mb-4">
                  <h3 className="font-bold text-[#9B1B1B] text-lg">Đã tạo {generatedLinks.length} link:</h3>
                </div>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {generatedLinks.map((item, index) => (
                    <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-4">
                      <div className="flex-1 overflow-hidden">
                        <p className="font-bold text-gray-800 mb-1">{item.name}</p>
                        <p className="text-xs text-gray-400 truncate font-mono">{item.url}</p>
                      </div>
                      <button 
                        onClick={() => handleCopy(index)}
                        className={`shrink-0 font-bold px-4 py-2 rounded-lg transition text-xs shadow-sm ${item.copied ? 'bg-green-500 text-white' : 'bg-[#E5C158] text-[#9B1B1B]'}`}
                      >
                        {item.copied ? "✔️ Đã Copy" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: XỬ LÝ BẰNG EXCEL ================= */}
        {activeTab === 'excel' && (
          <div className="space-y-6 animate-fade-in">
            
            <div className="bg-green-50 border border-green-200 p-6 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
              <h3 className="font-bold text-green-800 mb-2">Bước 1: Tải File Mẫu</h3>
              <p className="text-sm text-green-700 mb-4">Tải file Excel mẫu về máy và điền danh sách khách mời của bạn vào cột "Tên Khách Mời".</p>
              <button onClick={handleDownloadTemplate} className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-green-700 transition">
                📥 Tải File Excel Mẫu
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              <h3 className="font-bold text-blue-800 mb-2">Bước 2: Up File & Lấy Kết Quả</h3>
              <p className="text-sm text-blue-700 mb-4">Tải lên file bạn vừa điền xong. Hệ thống sẽ tự động tạo link và trả về cho bạn một file Excel mới hoàn chỉnh.</p>
              
              <div className="relative">
                <input 
                  type="file" 
                  accept=".xlsx, .xls"
                  onChange={handleExcelUpload}
                  disabled={excelProcessing}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer disabled:opacity-50"
                />
                {excelProcessing && (
                  <div className="mt-3 text-sm font-bold text-blue-600 animate-pulse flex items-center gap-2">
                    <span>⚙️</span> Đang xử lý hàng loạt link thiệp...
                  </div>
                )}
              </div>
            </div>

            <div className="text-center p-4">
              <p className="text-xs text-gray-400 italic">Dữ liệu được xử lý 100% trên thiết bị của bạn, bảo mật an toàn và không lưu trữ trên máy chủ.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}