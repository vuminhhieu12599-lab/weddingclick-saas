"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function VIPPortal() {
  const params = useParams();
  const id = params.id;
  const [guestName, setGuestName] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const handleGenerate = () => {
    if (!guestName.trim()) return;
    const url = `${baseUrl}/${id}?n=${encodeURIComponent(guestName.trim())}`;
    setGeneratedUrl(url);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl border-2 border-[#E5C158]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#9B1B1B] mb-2">💎 Trợ Lý Tạo Thiệp</h1>
          <p className="text-sm text-gray-500">Công cụ dành riêng cho Cô Dâu & Chú Rể để cá nhân hóa lời mời.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">1. Nhập Tên Khách Mời / Đại Diện:</label>
            <input 
              type="text" 
              value={guestName} 
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="VD: Gia đình Anh Hiếu, Chú Nam..."
              className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#9B1B1B] focus:outline-none transition text-gray-800"
            />
          </div>

          <button 
            onClick={handleGenerate}
            className="w-full bg-[#9B1B1B] text-white font-bold py-4 rounded-xl hover:bg-red-800 transition shadow-lg"
          >
            Tạo Link Thiệp Riêng
          </button>
        </div>

        {generatedUrl && (
          <div className="mt-8 p-5 bg-green-50 border border-green-200 rounded-xl animate-fade-in">
            <p className="text-xs font-bold text-green-800 mb-2 uppercase">Link đã sẵn sàng:</p>
            <div className="bg-white p-3 rounded-lg border border-green-100 text-sm text-gray-600 break-all mb-3 font-mono">
              {generatedUrl}
            </div>
            <button 
              onClick={handleCopy}
              className={`w-full font-bold py-3 rounded-lg transition ${copied ? 'bg-green-500 text-white' : 'bg-[#E5C158] text-[#9B1B1B]'}`}
            >
              {copied ? "✔️ Đã Copy Link!" : "Copy Link Ngay"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}